import React, { useState } from 'react';
import { UserCog, Shield, Lock, Users, ChevronRight, Save, Trash2, Plus } from 'lucide-react';

export default function AdminDashboard({ users = [], stages = [], onUpdateUserRole, onDeleteUser, onAddUser }) {
    const [newUserEmail, setNewUserEmail] = useState('');
    const [newUserRole, setNewUserRole] = useState('REVIEWER');

    return (
        <div className="flex-1 overflow-auto bg-slate-50 p-6 custom-scrollbar">
            <div className="max-w-5xl mx-auto space-y-8">
                {/* HEADER */}
                <div className="flex justify-between items-end">
                    <div>
                        <h2 className="text-2xl font-bold text-slate-800 flex items-center gap-3">
                            <Shield className="w-8 h-8 text-indigo-600" />
                            Admin Control Center
                        </h2>
                        <p className="text-slate-500 text-sm mt-1">Manage user permissions, roles, and stage access.</p>
                    </div>
                </div>

                {/* ROLE MANAGEMENT */}
                <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
                    <div className="px-6 py-4 border-b border-slate-100 bg-slate-50/50 flex justify-between items-center">
                        <h3 className="font-bold text-slate-700 flex items-center gap-2">
                            <Users className="w-5 h-5 text-indigo-500" />
                            User & Role Management
                        </h3>
                    </div>

                    <div className="p-6">
                        <table className="w-full text-left">
                            <thead>
                                <tr className="text-[10px] font-bold text-slate-400 uppercase tracking-widest border-b">
                                    <th className="pb-3 px-2">Email Address</th>
                                    <th className="pb-3 px-2">Assigned Role</th>
                                    <th className="pb-3 px-2 text-right">Actions</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-50 text-sm">
                                {users.map(user => (
                                    <tr key={user.email} className="hover:bg-slate-50 transition-colors">
                                        <td className="py-4 px-2 font-medium text-slate-700">{user.email}</td>
                                        <td className="py-4 px-2">
                                            <select
                                                value={user.role}
                                                onChange={(e) => onUpdateUserRole(user.email, e.target.value)}
                                                className={`text-xs font-bold py-1 px-2 rounded border-none focus:ring-2 focus:ring-indigo-500 cursor-pointer
                          ${user.role === 'ADMIN' ? 'bg-red-50 text-red-700' :
                                                        user.role === 'CURATOR' ? 'bg-blue-50 text-blue-700' :
                                                            'bg-slate-100 text-slate-600'}`}
                                            >
                                                <option value="ADMIN">ADMIN</option>
                                                <option value="CURATOR">CURATOR</option>
                                                <option value="REVIEWER">REVIEWER</option>
                                                <option value="GUEST">GUEST</option>
                                            </select>
                                        </td>
                                        <td className="py-4 px-2 text-right">
                                            <button
                                                onClick={() => onDeleteUser(user.email)}
                                                className="p-2 text-slate-300 hover:text-red-500 transition-colors"
                                                title="Delete User"
                                            >
                                                <Trash2 className="w-4 h-4" />
                                            </button>
                                        </td>
                                    </tr>
                                ))}

                                {/* ADD NEW USER ROW */}
                                <tr className="bg-indigo-50/30">
                                    <td className="py-4 px-2">
                                        <input
                                            type="email"
                                            placeholder="new-user@example.com"
                                            value={newUserEmail}
                                            onChange={(e) => setNewUserEmail(e.target.value)}
                                            className="w-full bg-white border border-slate-200 rounded px-3 py-1.5 text-xs focus:ring-2 focus:ring-indigo-500 outline-none"
                                        />
                                    </td>
                                    <td className="py-4 px-2">
                                        <select
                                            value={newUserRole}
                                            onChange={(e) => setNewUserRole(e.target.value)}
                                            className="text-xs font-bold py-1.5 px-2 rounded border border-slate-200 bg-white focus:ring-2 focus:ring-indigo-500 outline-none cursor-pointer"
                                        >
                                            <option value="ADMIN">ADMIN</option>
                                            <option value="CURATOR">CURATOR</option>
                                            <option value="REVIEWER">REVIEWER</option>
                                            <option value="GUEST">GUEST</option>
                                        </select>
                                    </td>
                                    <td className="py-4 px-2 text-right">
                                        <button
                                            onClick={() => {
                                                if (newUserEmail) {
                                                    onAddUser(newUserEmail, newUserRole);
                                                    setNewUserEmail('');
                                                }
                                            }}
                                            className="bg-indigo-600 text-white p-2 rounded hover:bg-indigo-700 transition-all flex items-center gap-2 text-xs font-bold ml-auto shadow-md active:scale-95"
                                        >
                                            <Plus className="w-3.5 h-3.5" />
                                            Add User
                                        </button>
                                    </td>
                                </tr>
                            </tbody>
                        </table>
                    </div>
                </div>

                {/* STAGE PERMISSIONS */}
                <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
                    <div className="px-6 py-4 border-b border-slate-100 bg-slate-50/50">
                        <h3 className="font-bold text-slate-700 flex items-center gap-2">
                            <Lock className="w-5 h-5 text-indigo-500" />
                            Stage Access Permissions
                        </h3>
                    </div>
                    <div className="p-6 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                        {stages.map(stage => (
                            <div key={stage.id} className="border border-slate-100 rounded-lg p-4 hover:shadow-md transition-shadow">
                                <div className="flex justify-between items-start mb-3">
                                    <div className="font-bold text-slate-800">{stage.name}</div>
                                    <div className="text-[10px] bg-indigo-50 text-indigo-600 px-2 py-0.5 rounded-full font-bold">Public</div>
                                </div>
                                <div className="space-y-2">
                                    <div className="flex items-center justify-between text-xs py-2 border-b border-slate-50 cursor-not-allowed opacity-60">
                                        <span className="text-slate-500 italic">Stage lock feature coming soon...</span>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>

                {/* INFO ALERT */}
                <div className="bg-blue-50 border border-blue-100 rounded-lg p-4 flex gap-3 items-start">
                    <ChevronRight className="w-5 h-5 text-blue-500 shrink-0" />
                    <div className="text-xs text-blue-700 leading-relaxed">
                        <strong>Note on User Data:</strong> Permissions are strictly enforced based on the email address used during login. Changes to roles are synchronized with the <code>Config_Users</code> sheet in your Google Spreadsheet.
                    </div>
                </div>
            </div>
        </div>
    );
}
