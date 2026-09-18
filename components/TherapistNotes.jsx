"use client";
import { useState } from "react";
import { StickyNote, ChevronDown, ChevronUp, Edit2, Trash2, X } from "lucide-react";

export default function TherapistNotes({ notes, onAddNote, onEditNote, onDeleteNote }) {
  const [draft, setDraft] = useState("");
  const [expanded, setExpanded] = useState(true);
  const [editingId, setEditingId] = useState(null);
  const [editValue, setEditValue] = useState("");

  const handleAdd = () => {
    if (!draft.trim()) return;
    onAddNote(draft.trim());
    setDraft("");
  };

  const startEdit = (id, currentText) => {
    setEditingId(id);
    setEditValue(currentText);
  };

  const saveEdit = (id) => {
    if (editValue.trim()) onEditNote(id, editValue.trim());
    setEditingId(null);
  };

  return (
    <div className="mb-9">
      <button onClick={() => setExpanded(!expanded)} className="text-xs tracking-wide text-[#26314F]/45 mb-3 flex items-center gap-1.5">
        <StickyNote size={12} /> Therapist notes {expanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
      </button>
      {expanded && (
        <div className="border border-[#26314F]/12 rounded-sm bg-white p-4">
          <div className="flex gap-2 mb-4">
            <input
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleAdd()}
              placeholder="Add a note for yourself — date-stamped automatically"
              className="flex-1 border border-[#26314F]/20 rounded-sm px-3 py-2 text-sm bg-white focus:outline-none focus:border-[#26314F]/50"
            />
            <button onClick={handleAdd} className="bg-[#26314F] text-[#FAF6EF] text-sm px-3 py-2 rounded-sm hover:bg-[#26314F]/90">Add</button>
          </div>
          {notes.length === 0 ? (
            <p className="text-sm text-[#26314F]/40 italic">No notes yet.</p>
          ) : (
            <div className="space-y-3">
              {[...notes].reverse().map((n) => {
                const isEditing = editingId === n.id;
                return (
                  <div key={n.id} className="text-sm border-l-2 border-[#26314F]/15 pl-3 group">
                    <div className="text-xs text-[#26314F]/40 mb-0.5">{n.date}</div>
                    {isEditing ? (
                      <div>
                        <input
                          value={editValue}
                          onChange={(e) => setEditValue(e.target.value)}
                          onKeyDown={(e) => e.key === "Enter" && saveEdit(n.id)}
                          autoFocus
                          className="w-full border border-[#26314F]/25 rounded-sm px-2 py-1 text-sm mb-1.5 focus:outline-none focus:border-[#26314F]/50"
                        />
                        <div className="flex gap-2">
                          <button onClick={() => saveEdit(n.id)} className="text-xs text-[#26314F] border border-[#26314F]/25 px-2 py-1 rounded-sm hover:bg-[#26314F]/5">Save</button>
                          <button onClick={() => setEditingId(null)} className="text-xs text-[#26314F]/50 flex items-center gap-1 px-2 py-1 hover:text-[#26314F]"><X size={11} /> Cancel</button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-start justify-between gap-2">
                        <div className="text-[#26314F]/80">{n.text}</div>
                        <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                          <button onClick={() => startEdit(n.id, n.text)} className="text-[#26314F]/40 hover:text-[#26314F] p-0.5"><Edit2 size={12} /></button>
                          <button onClick={() => onDeleteNote(n.id)} className="text-[#26314F]/40 hover:text-[#B96B72] p-0.5"><Trash2 size={12} /></button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
