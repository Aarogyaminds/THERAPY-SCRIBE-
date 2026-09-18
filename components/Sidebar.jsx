"use client";
import { Plus, Users, Settings } from "lucide-react";

export default function Sidebar({ patients, selectedId, onSelect, onAddClick, onLogout }) {
  return (
    <div className="w-72 shrink-0 border-r border-[#26314F]/12 h-full flex flex-col bg-[#FAF6EF]">
      <div className="px-6 pt-8 pb-5 flex items-start justify-between">
        <div>
          <h1 className="text-2xl text-[#26314F]" style={{ fontFamily: "Fraunces, serif" }}>Aarogya Minds</h1>
          <p className="text-sm text-[#26314F]/55 mt-1">Session workspace</p>
        </div>
        <button onClick={onLogout} title="Log out" className="text-[#26314F]/40 hover:text-[#26314F] mt-1">
          <Settings size={17} />
        </button>
      </div>
      <button
        onClick={onAddClick}
        className="mx-6 mb-4 flex items-center gap-2 text-sm text-[#26314F] border border-[#26314F]/25 rounded-sm px-3 py-2 hover:bg-[#26314F]/5 transition-colors"
      >
        <Plus size={15} /> Register patient
      </button>
      <div className="px-6 pb-2 text-xs tracking-wide text-[#26314F]/40 flex items-center gap-1.5">
        <Users size={12} /> Patients ({patients.length})
      </div>
      <div className="flex-1 overflow-y-auto">
        {patients.length === 0 && <p className="px-6 text-sm text-[#26314F]/40 italic mt-2">No patients yet — register one to begin.</p>}
        {patients.map((p) => (
          <button
            key={p.id}
            onClick={() => onSelect(p.id)}
            className={`w-full text-left px-6 py-3 border-l-2 transition-colors ${
              selectedId === p.id ? "border-[#26314F] bg-[#26314F]/[0.04]" : "border-transparent hover:bg-[#26314F]/[0.02]"
            }`}
          >
            <div className="text-[15px] text-[#26314F]" style={{ fontFamily: "Fraunces, serif" }}>{p.name}</div>
            <div className="text-xs text-[#26314F]/45 mt-0.5">
              {p.sessionCount} session{p.sessionCount !== 1 ? "s" : ""}
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
