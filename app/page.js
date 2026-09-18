"use client";
import { useState, useEffect, useCallback } from "react";
import { Loader2 } from "lucide-react";
import Sidebar from "@/components/Sidebar";
import AddPatientForm from "@/components/AddPatientForm";
import Profile from "@/components/Profile";

export default function ClinicApp() {
  const [patients, setPatients] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [selectedPatient, setSelectedPatient] = useState(null);
  const [adding, setAdding] = useState(false);
  const [loading, setLoading] = useState(true);

  const refreshList = useCallback(async () => {
    const res = await fetch("/api/patients");
    const data = await res.json();
    setPatients(data.patients || []);
    return data.patients || [];
  }, []);

  const refreshSelected = useCallback(async (id) => {
    if (!id) { setSelectedPatient(null); return; }
    const res = await fetch(`/api/patients/${id}`);
    const data = await res.json();
    setSelectedPatient(data.patient);
  }, []);

  useEffect(() => {
    (async () => {
      const list = await refreshList();
      if (list.length) setSelectedId(list[0].id);
      setLoading(false);
    })();
  }, [refreshList]);

  useEffect(() => {
    refreshSelected(selectedId);
  }, [selectedId, refreshSelected]);

  const handleSelect = (id) => {
    setSelectedId(id);
    setAdding(false);
  };

  const handleAddPatient = async (form) => {
    const res = await fetch("/api/patients", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    const data = await res.json();
    if (res.ok) {
      await refreshList();
      setSelectedId(data.patient.id);
      setAdding(false);
    }
  };

  const handleSaveMeetLink = async (patientId, link) => {
    await fetch(`/api/patients/${patientId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ meetLink: link }),
    });
    await refreshSelected(patientId);
  };

  const handleLogout = async () => {
    await fetch("/api/auth", { method: "DELETE" });
    window.location.href = "/login";
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen bg-[#FAF6EF] text-[#26314F]/50 text-sm">
        <Loader2 size={16} className="animate-spin mr-2" /> Loading workspace...
      </div>
    );
  }

  return (
    <div className="flex h-screen bg-[#FAF6EF]">
      <Sidebar patients={patients} selectedId={selectedId} onSelect={handleSelect} onAddClick={() => setAdding(true)} onLogout={handleLogout} />
      {adding ? (
        <div className="flex-1 overflow-y-auto"><AddPatientForm onCancel={() => setAdding(false)} onSave={handleAddPatient} /></div>
      ) : selectedPatient ? (
        <Profile key={selectedPatient.id} patient={selectedPatient} onRefresh={() => refreshSelected(selectedId)} onSaveMeetLink={handleSaveMeetLink} />
      ) : (
        <div className="flex-1 flex items-center justify-center text-[#26314F]/40 text-sm">Register a patient to begin.</div>
      )}
    </div>
  );
}
