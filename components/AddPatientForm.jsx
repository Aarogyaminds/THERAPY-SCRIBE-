"use client";
import { useState } from "react";

export default function AddPatientForm({ onCancel, onSave }) {
  const [form, setForm] = useState({ name: "", age: "", email: "", address: "" });
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    await onSave(form);
    setSaving(false);
  };

  return (
    <div className="max-w-md mx-auto mt-16 px-6">
      <h2 className="text-2xl text-[#26314F] mb-1" style={{ fontFamily: "Fraunces, serif" }}>Register patient</h2>
      <p className="text-sm text-[#26314F]/55 mb-8">Basic details create their profile.</p>
      <div className="space-y-4">
        {["name", "age", "email", "address"].map((field) => (
          <div key={field}>
            <label className="text-xs text-[#26314F]/50 capitalize block mb-1.5">{field}</label>
            <input
              value={form[field]}
              onChange={(e) => setForm({ ...form, [field]: e.target.value })}
              className="w-full border border-[#26314F]/20 rounded-sm px-3 py-2 text-sm text-[#26314F] bg-white focus:outline-none focus:border-[#26314F]/50"
            />
          </div>
        ))}
      </div>
      <div className="flex gap-3 mt-8">
        <button
          onClick={handleSave}
          disabled={!form.name || saving}
          className="bg-[#26314F] text-[#FAF6EF] text-sm px-4 py-2 rounded-sm hover:bg-[#26314F]/90 disabled:opacity-40"
        >
          {saving ? "Creating..." : "Create profile"}
        </button>
        <button onClick={onCancel} className="text-sm text-[#26314F]/60 px-4 py-2 hover:text-[#26314F]">Cancel</button>
      </div>
    </div>
  );
}
