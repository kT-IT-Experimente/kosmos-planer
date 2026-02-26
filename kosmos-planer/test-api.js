const token = 'placeholder'; // Not needed since it's just a test
const url = 'https://kt-automatisierung.cloud/webhook/api/data'\;

fetch(url, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    action: 'update',
    spreadsheetId: '1z324T2i-iHItp2wJ0Fms7p5E9Oq68b9tYtz6bTGEIzw', // We don't have this but we can use any
    range: "'Config_Users'!D1:D1",
    values: [['CLOSED']]
  })
}).then(res => res.text()).then(console.log).catch(console.error);
