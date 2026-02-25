#!/usr/bin/env python3
"""
Usage: python3 fix_workflow.py input.json
Outputs: n8n_workflow_fixed.json

Fixes:
1. Adds 4 "Verify Magic JWT" fallback nodes for dual auth
2. Routes Google Token error outputs through Magic JWT fallback
3. Fixes Store Nonce tab characters
4. Fixes Write proxy to use server credentials
5. Fixes Prepare Rating Data email reference
6. Reconnects Mark Token USED
"""
import json, sys

if len(sys.argv) < 2:
    print("Usage: python3 fix_workflow.py <input.json>")
    sys.exit(1)

with open(sys.argv[1]) as f:
    wf = json.load(f)

nodes = wf["nodes"]
conns = wf["connections"]

# -- Helper --
def jwt_code(webhook_ref, source="header"):
    if source == "header":
        extract = f"const authHeader = $('{webhook_ref}').first().json.headers?.authorization || '';\nconst token = authHeader.replace(/^Bearer\\\\s+/i, '').trim();"
    else:
        extract = f"const token = $('{webhook_ref}').first().json.body?.token || '';"
    return (
        "const jwt = require('jsonwebtoken');\n"
        "const SECRET = '537f8c4ff1959fdc1d54ce852607f2c30f08607925a39e61be189d3d58e29ff1';\n"
        f"{extract}\n"
        "if (!token) return [{ json: { error: 'No token' } }];\n"
        "try {\n"
        "  const decoded = jwt.verify(token, SECRET);\n"
        "  if (decoded.email) return [{ json: { email: decoded.email, role: decoded.role || 'TEILNEHMENDE', authType: 'magic' } }];\n"
        "} catch(e) {}\n"
        "return [{ json: { error: 'Invalid token' } }];"
    )

# 1) Add 4 Magic JWT nodes
new_nodes = [
    {"parameters":{"jsCode":jwt_code("Webhook (POST /api/data)","header")},"id":"magic-jwt-data","name":"Verify Magic JWT (Data)","type":"n8n-nodes-base.code","typeVersion":2,"position":[336,1392]},
    {"parameters":{"jsCode":jwt_code("Webhook (POST /auth/verify)","body")},"id":"magic-jwt-auth","name":"Verify Magic JWT (Auth)","type":"n8n-nodes-base.code","typeVersion":2,"position":[336,1048]},
    {"parameters":{"jsCode":jwt_code("Webhook (POST /api/rating)","header")},"id":"magic-jwt-rating","name":"Verify Magic JWT (Rating)","type":"n8n-nodes-base.code","typeVersion":2,"position":[1648,144]},
    {"parameters":{"jsCode":jwt_code("Webhook (POST /api/save)","header")},"id":"magic-jwt-save","name":"Verify Magic JWT (Save)","type":"n8n-nodes-base.code","typeVersion":2,"position":[1808,1448]},
]
nodes.extend(new_nodes)

# 2) Update connections
def conn(node, idx=0):
    return [{"node": node, "type": "main", "index": idx}]

conns["Verify Google Token1"] = {"main": [conn("Token Valid?1"), conn("Verify Magic JWT (Data)")]}
conns["Verify Magic JWT (Data)"] = {"main": [conn("Token Valid?1")]}
conns["Verify Google Token2"] = {"main": [conn("Token Valid?2"), conn("Verify Magic JWT (Auth)")]}
conns["Verify Magic JWT (Auth)"] = {"main": [conn("Token Valid?2")]}
conns["Verify Google Token"] = {"main": [conn("Token Valid?"), conn("Verify Magic JWT (Rating)")]}
conns["Verify Magic JWT (Rating)"] = {"main": [conn("Token Valid?")]}
conns["Verify Google Token3"] = {"main": [conn("Token Valid?3"), conn("Verify Magic JWT (Save)")]}
conns["Verify Magic JWT (Save)"] = {"main": [conn("Token Valid?3")]}

# 3) Fix Prepare Rating Data
for n in nodes:
    if n["name"] == "Prepare Rating Data":
        n["parameters"]["jsCode"] = (
            "const body = $('Webhook (POST /api/rating)').first().json.body;\n"
            "let email = '';\n"
            "try { email = $('Verify Google Token').first().json.email; } catch(e) {}\n"
            "if (!email) { try { email = $('Verify Magic JWT (Rating)').first().json.email; } catch(e) {} }\n"
            "return [{ json: {\n"
            "  'Zeitstempel': new Date().toISOString(),\n"
            "  'Session_ID': body.sessionId || '',\n"
            "  'Reviewer_Email': email,\n"
            "  'Score': body.score || 0,\n"
            "  'Kommentar': body.kommentar || '',\n"
            "  'Kategorie': body.kategorie || 'relevanz'\n"
            "}}];"
        )

# 4) Fix Store Nonce tabs
for n in nodes:
    if n["name"] == "Store Nonce in Sheet":
        v = n["parameters"]["columns"]["value"]
        for k in v:
            if isinstance(v[k], str):
                v[k] = v[k].replace("=\t{{", "={{ ")

# 5) Fix Write proxy
for n in nodes:
    if n["name"] == "Write to Google Sheets (Proxy)":
        n["parameters"]["authentication"] = "predefinedCredentialType"
        n["parameters"]["nodeCredentialType"] = "googleApi"
        n["parameters"]["sendHeaders"] = False
        n["parameters"].pop("headerParameters", None)
        n["credentials"] = {"googleApi": {"id": "LvHMiivmZXgTlEwU", "name": "Google Service Account account"}}

# 6) Reconnect Mark Token USED
for n in nodes:
    if n["name"] == "Mark Token USED":
        n["alwaysOutputData"] = True
        n["onError"] = "continueRegularOutput"
conns["If Nonce Valid"]["main"][0] = conn("Mark Token USED")
conns["Mark Token USED"] = {"main": [conn("Read Config_Users")]}

wf["name"] = "Kosmos - Magic Link Request (Dual Auth)"

with open("n8n_workflow_fixed.json", "w") as f:
    json.dump(wf, f, indent=2, ensure_ascii=False)

print(f"Done! {len(new_nodes)} nodes added, total {len(nodes)} nodes.")
print("Output: n8n_workflow_fixed.json")
