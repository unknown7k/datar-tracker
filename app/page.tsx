"use client";
/* eslint-disable react-hooks/refs, react-hooks/set-state-in-effect -- dnd-kit exposes callback refs; local storage hydrates after mount. */

import { useEffect, useMemo, useState } from "react";
import { DndContext, DragEndEvent, DragOverlay, DragOverEvent, KeyboardSensor, PointerSensor, closestCorners, useDroppable, useSensor, useSensors } from "@dnd-kit/core";
import { SortableContext, arrayMove, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { ArrowDown, ArrowUp, BarChart3, Check, CornerDownLeft, Settings as Gear, GripVertical, MessageSquare, Paperclip, Plus, RotateCcw, Sparkles, Trash2, X } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { analyzeProject, ProjectNudge } from "@/lib/project-analysis";

type Priority = "urgent" | "normal" | "low";
type Phase = { id: string; name: string };
type HistoryEntry = { id: string; type: "auto" | "comment"; message: string; timestamp: string };
type Feature = { id: string; title: string; description: string; phaseId: string; assignee: string; priority: Priority; createdAt: string; updatedAt: string; history: HistoryEntry[] };
type ProjectState = { project: { name: string; description: string; createdAt: string }; phases: Phase[]; features: Feature[] };

const STORAGE_KEY = "recovery-project-board-v1";
const priorities: Array<{ id: Priority; label: string }> = [{ id: "urgent", label: "Urgent" }, { id: "normal", label: "Normal" }, { id: "low", label: "Low" }];
const isoDaysAgo = (days: number) => new Date(Date.now() - days * 86_400_000).toISOString();
const entry = (message: string, days = 0, type: "auto" | "comment" = "auto"): HistoryEntry => ({ id: `${message}-${days}`, type, message, timestamp: isoDaysAgo(days) });

const seedState: ProjectState = {
  project: { name: "Data Recovery & Reconstruction Platform", description: "A deterministic, provenance-first recovery engine for damaged files.", createdAt: isoDaysAgo(28) },
  phases: [{ id: "backlog", name: "Backlog" }, { id: "progress", name: "In Progress" }, { id: "review", name: "Review" }, { id: "done", name: "Done" }],
  features: [
    { id: "research", title: "Architecture research — 16 topics", description: "Complete research program covering the recovery core, formats, candidate generation, validation, provenance, security, and delivery roadmap.", phaseId: "done", assignee: "Nitiraj", priority: "urgent", createdAt: isoDaysAgo(24), updatedAt: isoDaysAgo(2), history: [entry("Created in Backlog", 24), entry("Moved from Backlog to Done", 2)] },
    { id: "stack", title: "Technology stack decision", description: "Lock Rust, Tokio, Tonic, PostgreSQL, content-addressed artifacts, Python research tooling, and GitHub Actions.", phaseId: "done", assignee: "Nitiraj", priority: "normal", createdAt: isoDaysAgo(2), updatedAt: isoDaysAgo(1), history: [entry("Created in Review", 2), entry("Moved from Review to Done", 1)] },
    { id: "foundation", title: "Repository & workspace scaffold", description: "Create the Rust Cargo workspace, core crate boundaries, CI checks, database environment, and contribution rules.", phaseId: "progress", assignee: "Nitiraj", priority: "urgent", createdAt: isoDaysAgo(7), updatedAt: isoDaysAgo(6), history: [entry("Created in Backlog", 7), entry("Moved from Backlog to In Progress", 6)] },
    { id: "git-onboarding", title: "Git onboarding & team workflow", description: "Practice branch, commit, push, pull request, review, merge, and safe synchronization as a two-developer team.", phaseId: "progress", assignee: "Sister", priority: "normal", createdAt: isoDaysAgo(1), updatedAt: isoDaysAgo(1), history: [entry("Created in In Progress", 1)] },
    { id: "protocol", title: "Plugin protocol v1", description: "Define versioned protobuf contracts for discovery, candidate generation, reconstruction, validation, budgets, and provenance.", phaseId: "backlog", assignee: "Nitiraj", priority: "urgent", createdAt: isoDaysAgo(1), updatedAt: isoDaysAgo(1), history: [entry("Created in Backlog", 1)] },
    { id: "png-slice", title: "PNG recovery vertical slice", description: "First complete recovery flow: scan, parse, diagnose, generate bounded candidates, rebuild, validate, and export provenance.", phaseId: "backlog", assignee: "Sister", priority: "normal", createdAt: isoDaysAgo(1), updatedAt: isoDaysAgo(1), history: [entry("Created in Backlog", 1)] },
    { id: "formats", title: "JPEG, ZIP & PDF plugins", description: "Extend the validated recovery pipeline to the remaining MVP formats after the PNG reference slice is stable.", phaseId: "backlog", assignee: "Unassigned", priority: "low", createdAt: isoDaysAgo(1), updatedAt: isoDaysAgo(1), history: [entry("Created in Backlog", 1)] },
  ],
};

const uid = (prefix: string) => `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
const rotationFor = (id: string) => (([...id].reduce((value, char) => value + char.charCodeAt(0), 0) % 7) - 3) * 0.45;
const initials = (name: string) => !name.trim() || name === "Unassigned" ? "?" : name.split(/\s+/).map((part) => part[0]).join("").slice(0, 2).toUpperCase();
const formatDate = (value: string) => new Intl.DateTimeFormat("en", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(new Date(value));

function StickyNote({ feature, phaseName, onOpen, onPriority, onComment, overlay = false }: { feature: Feature; phaseName: string; onOpen: () => void; onPriority: (priority: Priority) => void; onComment: (comment: string) => void; overlay?: boolean }) {
  const [flipped, setFlipped] = useState(false);
  const [comment, setComment] = useState("");
  const sortable = useSortable({ id: feature.id, disabled: overlay });
  const style = { transform: overlay ? `rotate(${rotationFor(feature.id)}deg)` : CSS.Transform.toString(sortable.transform), transition: sortable.transition };
  const addComment = () => { if (!comment.trim()) return; onComment(comment.trim()); setComment(""); };
  return <article ref={sortable.setNodeRef} style={style} className={`sticky-wrap ${sortable.isDragging ? "is-dragging" : ""} ${overlay ? "drag-overlay" : ""}`}>
    <div className={`sticky-inner ${flipped ? "is-flipped" : ""}`}>
      <section className="sticky-face sticky-front" style={{ "--note-rotation": `${rotationFor(feature.id)}deg` } as React.CSSProperties}>
        <div className="note-topline">
          <DropdownMenu><DropdownMenuTrigger asChild><button className={`pushpin pin-${feature.priority}`} aria-label={`Priority: ${feature.priority}`} onPointerDown={(event) => event.stopPropagation()}><span /></button></DropdownMenuTrigger><DropdownMenuContent className="paper-menu" align="start">{priorities.map((priority) => <DropdownMenuItem key={priority.id} onSelect={() => onPriority(priority.id)}><span className={`mini-pin pin-${priority.id}`} /> {priority.label}{feature.priority === priority.id && <Check className="ml-auto size-4" />}</DropdownMenuItem>)}</DropdownMenuContent></DropdownMenu>
          <button className="drag-handle" {...sortable.attributes} {...sortable.listeners} aria-label={`Drag ${feature.title}`}><GripVertical /></button>
        </div>
        <button className="note-content" onClick={onOpen}><p className="eyebrow">{phaseName}</p><h3>{feature.title}</h3><p className="note-description">{feature.description}</p></button>
        <div className="note-footer"><span className="ink-stamp" title={feature.assignee}>{initials(feature.assignee)}</span><span className="priority-label">{feature.priority}</span></div>
        <button className="page-corner" onClick={() => setFlipped(true)} aria-label="Show history"><span /></button>
      </section>
      <section className="sticky-face sticky-back">
        <div className="back-header"><span><MessageSquare /> History</span><button onClick={() => setFlipped(false)} aria-label="Flip to front"><RotateCcw /></button></div>
        <div className="history-list">{[...feature.history].reverse().map((item) => <div className={`history-entry ${item.type}`} key={item.id}><p>{item.message}</p><time>{formatDate(item.timestamp)}</time></div>)}</div>
        <div className="comment-compose"><input value={comment} onChange={(event) => setComment(event.target.value)} onKeyDown={(event) => event.key === "Enter" && addComment()} placeholder="Add a note…" aria-label="Add comment" /><button onClick={addComment} aria-label="Post comment"><CornerDownLeft /></button></div>
      </section>
    </div>
  </article>;
}

function PhaseColumn({ phase, features, children }: { phase: Phase; features: Feature[]; children: React.ReactNode }) {
  const { setNodeRef, isOver } = useDroppable({ id: phase.id });
  return <section className={`phase-zone ${isOver ? "is-over" : ""}`}><div className="phase-label"><span>{phase.name}</span><b>{features.length}</b></div><SortableContext items={features.map((feature) => feature.id)} strategy={verticalListSortingStrategy}><div ref={setNodeRef} className="note-stack">{children}<div className="drop-hint">DROP NOTE HERE</div></div></SortableContext></section>;
}

export default function Home() {
  const [state, setState] = useState<ProjectState>(seedState);
  const [ready, setReady] = useState(false);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [featureModal, setFeatureModal] = useState(false);
  const [settingsModal, setSettingsModal] = useState(false);
  const [summaryModal, setSummaryModal] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [deletePhaseId, setDeletePhaseId] = useState<string | null>(null);
  const [nudges, setNudges] = useState<ProjectNudge[]>([]);
  const [analyzing, setAnalyzing] = useState(false);
  const [newFeature, setNewFeature] = useState({ title: "", description: "", assignee: "", priority: "normal" as Priority, phaseId: "backlog" });
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 7 } }), useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }));

  useEffect(() => { try { const stored = localStorage.getItem(STORAGE_KEY); if (stored) setState(JSON.parse(stored)); } catch {} setReady(true); }, []);
  useEffect(() => { if (ready) localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); }, [state, ready]);

  const activeFeature = state.features.find((feature) => feature.id === activeId);
  const selected = state.features.find((feature) => feature.id === selectedId);
  const finalPhase = state.phases.at(-1);
  const completed = state.features.filter((feature) => feature.phaseId === finalPhase?.id).length;
  const completion = state.features.length ? Math.round((completed / state.features.length) * 100) : 0;
  const appendHistory = (feature: Feature, message: string, type: "auto" | "comment" = "auto"): Feature => ({ ...feature, updatedAt: new Date().toISOString(), history: [...feature.history, { id: uid("history"), type, message, timestamp: new Date().toISOString() }] });
  const updateFeature = (id: string, updater: (feature: Feature) => Feature) => setState((current) => ({ ...current, features: current.features.map((feature) => feature.id === id ? updater(feature) : feature) }));
  const findPhaseForTarget = (id: string) => state.phases.find((phase) => phase.id === id)?.id ?? state.features.find((feature) => feature.id === id)?.phaseId;
  const moveFeature = (event: DragOverEvent | DragEndEvent) => {
    const movingId = String(event.active.id); const targetId = event.over ? String(event.over.id) : null; if (!targetId) return;
    const nextPhaseId = findPhaseForTarget(targetId); const moving = state.features.find((feature) => feature.id === movingId);
    if (!moving || !nextPhaseId || moving.phaseId === nextPhaseId) return;
    const fromName = state.phases.find((phase) => phase.id === moving.phaseId)?.name ?? "Unknown"; const toName = state.phases.find((phase) => phase.id === nextPhaseId)?.name ?? "Unknown";
    updateFeature(movingId, (feature) => appendHistory({ ...feature, phaseId: nextPhaseId }, `Moved from ${fromName} to ${toName}`));
  };
  const handleDragEnd = (event: DragEndEvent) => { moveFeature(event); const active = String(event.active.id); const over = event.over ? String(event.over.id) : null; if (over && active !== over) setState((current) => { const from = current.features.findIndex((feature) => feature.id === active); const to = current.features.findIndex((feature) => feature.id === over); return from >= 0 && to >= 0 ? { ...current, features: arrayMove(current.features, from, to) } : current; }); setActiveId(null); };
  const changePriority = (id: string, priority: Priority) => updateFeature(id, (feature) => feature.priority === priority ? feature : appendHistory({ ...feature, priority }, `Priority changed from ${feature.priority} to ${priority}`));
  const addComment = (id: string, comment: string) => updateFeature(id, (feature) => appendHistory(feature, comment, "comment"));
  const createFeature = () => { if (!newFeature.title.trim() || !newFeature.phaseId) return; const now = new Date().toISOString(); const phase = state.phases.find((item) => item.id === newFeature.phaseId); setState((current) => ({ ...current, features: [...current.features, { id: uid("feature"), title: newFeature.title.trim(), description: newFeature.description.trim(), assignee: newFeature.assignee.trim() || "Unassigned", priority: newFeature.priority, phaseId: newFeature.phaseId, createdAt: now, updatedAt: now, history: [{ id: uid("history"), type: "auto", message: `Created in ${phase?.name ?? "phase"}`, timestamp: now }] }] })); setNewFeature({ title: "", description: "", assignee: "", priority: "normal", phaseId: state.phases[0]?.id ?? "" }); setFeatureModal(false); };
  const editSelected = (field: "assignee" | "priority", value: string) => { if (!selected) return; updateFeature(selected.id, (feature) => { const previous = feature[field]; return previous === value ? feature : appendHistory({ ...feature, [field]: value }, `${field === "assignee" ? "Assignee" : "Priority"} changed from ${previous || "Unassigned"} to ${value}`); }); };
  const addPhase = () => setState((current) => ({ ...current, phases: [...current.phases, { id: uid("phase"), name: "New Phase" }] }));
  const renamePhase = (id: string, name: string) => setState((current) => ({ ...current, phases: current.phases.map((phase) => phase.id === id ? { ...phase, name } : phase) }));
  const reorderPhase = (index: number, delta: number) => setState((current) => ({ ...current, phases: arrayMove(current.phases, index, index + delta) }));
  const deletePhase = () => { if (!deletePhaseId || state.phases.length <= 1) return; const removed = state.phases.find((phase) => phase.id === deletePhaseId); const remaining = state.phases.filter((phase) => phase.id !== deletePhaseId); const fallback = remaining[0]; setState((current) => ({ ...current, phases: remaining, features: current.features.map((feature) => feature.phaseId === deletePhaseId ? appendHistory({ ...feature, phaseId: fallback.id }, `Moved from ${removed?.name ?? "deleted phase"} to ${fallback.name}`) : feature) })); setDeletePhaseId(null); };
  const runAnalysis = async () => { setAnalyzing(true); setNudges(await analyzeProject(state.features, state.phases)); setAnalyzing(false); };
  const phaseCounts = useMemo(() => state.phases.map((phase) => ({ ...phase, count: state.features.filter((feature) => feature.phaseId === phase.id).length })), [state]);
  const outstanding = state.features.filter((feature) => feature.phaseId !== finalPhase?.id);
  const workloads = [...outstanding.reduce((map, feature) => { map.set(feature.assignee, (map.get(feature.assignee) ?? 0) + 1); return map; }, new Map<string, number>()).entries()].sort((a, b) => b[1] - a[1]);
  if (!ready) return <main className="loading-board">Pinning the board…</main>;

  return <main className="app-shell">
    <header className="wood-header"><div className="brand-block"><span className="project-kicker">PROJECT / BOARD</span><h1>{state.project.name}</h1><p>{state.project.description}</p></div><div className="header-actions"><div className="completion-ticket"><strong>{completion}%</strong><span>COMPLETE</span></div><button className="board-button light" onClick={() => setFeatureModal(true)}><Plus /> Add feature</button><button className="board-button" onClick={() => setSummaryModal(true)}><BarChart3 /> Status</button><button className="metal-button" onClick={() => setSettingsModal(true)} aria-label="Board settings"><Gear /></button></div></header>
    <DndContext sensors={sensors} collisionDetection={closestCorners} onDragStart={(event) => setActiveId(String(event.active.id))} onDragOver={moveFeature} onDragEnd={handleDragEnd} onDragCancel={() => setActiveId(null)}>
      <div className="corkboard"><div className="board-summary-strip"><span>{state.features.length} FEATURES</span><i /><span>{completed} SHIPPED</span><i /><span>{outstanding.filter((feature) => feature.priority === "urgent").length} URGENT OPEN</span></div><div className="phases-grid" style={{ gridTemplateColumns: `repeat(${state.phases.length}, minmax(280px, 1fr))` }}>{state.phases.map((phase) => { const features = state.features.filter((feature) => feature.phaseId === phase.id); return <PhaseColumn key={phase.id} phase={phase} features={features}>{features.map((feature) => <StickyNote key={feature.id} feature={feature} phaseName={phase.name} onOpen={() => setSelectedId(feature.id)} onPriority={(priority) => changePriority(feature.id, priority)} onComment={(comment) => addComment(feature.id, comment)} />)}</PhaseColumn>; })}</div></div>
      <DragOverlay>{activeFeature ? <StickyNote feature={activeFeature} phaseName={state.phases.find((phase) => phase.id === activeFeature.phaseId)?.name ?? ""} onOpen={() => {}} onPriority={() => {}} onComment={() => {}} overlay /> : null}</DragOverlay>
    </DndContext>

    <Dialog open={featureModal} onOpenChange={setFeatureModal}><DialogContent className="memo-dialog"><DialogHeader><DialogTitle>Pin a new feature</DialogTitle><DialogDescription>Add the next module, function, or research topic.</DialogDescription></DialogHeader><div className="memo-form"><label>Feature title<input value={newFeature.title} onChange={(event) => setNewFeature({ ...newFeature, title: event.target.value })} autoFocus /></label><label>Description<textarea value={newFeature.description} onChange={(event) => setNewFeature({ ...newFeature, description: event.target.value })} rows={4} /></label><div className="form-row"><label>Assignee<input value={newFeature.assignee} onChange={(event) => setNewFeature({ ...newFeature, assignee: event.target.value })} placeholder="Name or Unassigned" /></label><label>Priority<select value={newFeature.priority} onChange={(event) => setNewFeature({ ...newFeature, priority: event.target.value as Priority })}>{priorities.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}</select></label></div><label>Initial phase<select value={newFeature.phaseId} onChange={(event) => setNewFeature({ ...newFeature, phaseId: event.target.value })}>{state.phases.map((phase) => <option key={phase.id} value={phase.id}>{phase.name}</option>)}</select></label><button className="board-button full" onClick={createFeature}><Plus /> Pin to board</button></div></DialogContent></Dialog>
    <Dialog open={Boolean(selected)} onOpenChange={(open) => !open && setSelectedId(null)}><DialogContent className="memo-dialog detail-dialog">{selected && <><DialogHeader><DialogTitle>{selected.title}</DialogTitle><DialogDescription>Created {formatDate(selected.createdAt)} · Updated {formatDate(selected.updatedAt)}</DialogDescription></DialogHeader><p className="full-description">{selected.description || "No description yet."}</p><div className="form-row"><label>Assignee<input value={selected.assignee} onChange={(event) => editSelected("assignee", event.target.value)} /></label><label>Priority<select value={selected.priority} onChange={(event) => editSelected("priority", event.target.value)}>{priorities.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}</select></label></div><div className="detail-history"><h3>Activity</h3>{[...selected.history].reverse().map((item) => <div className={`history-entry ${item.type}`} key={item.id}><p>{item.message}</p><time>{formatDate(item.timestamp)}</time></div>)}</div></>}</DialogContent></Dialog>
    <Dialog open={settingsModal} onOpenChange={setSettingsModal}><DialogContent className="memo-dialog"><DialogHeader><DialogTitle>Board phases</DialogTitle><DialogDescription>Rename, reorder, add, or remove workflow zones.</DialogDescription></DialogHeader><div className="phase-settings">{state.phases.map((phase, index) => <div className="phase-setting" key={phase.id}><span>{index + 1}</span><input value={phase.name} onChange={(event) => renamePhase(phase.id, event.target.value)} /><button disabled={index === 0} onClick={() => reorderPhase(index, -1)} aria-label="Move phase left"><ArrowUp /></button><button disabled={index === state.phases.length - 1} onClick={() => reorderPhase(index, 1)} aria-label="Move phase right"><ArrowDown /></button><button disabled={state.phases.length === 1} onClick={() => setDeletePhaseId(phase.id)} aria-label="Delete phase"><Trash2 /></button></div>)}<button className="board-button light full" onClick={addPhase}><Plus /> Add phase</button></div></DialogContent></Dialog>
    <Dialog open={summaryModal} onOpenChange={setSummaryModal}><DialogContent className="summary-dialog"><DialogHeader><DialogTitle>Project status memo</DialogTitle><DialogDescription>A quick look at flow, priorities, and workload.</DialogDescription></DialogHeader><div className="nudge-area"><div className="summary-heading"><h3>Board check</h3><button className="board-button small" onClick={runAnalysis} disabled={analyzing}><Sparkles /> {analyzing ? "Checking…" : "Check status"}</button></div>{nudges.map((nudge) => <article className="nudge-card" key={nudge.id}><Paperclip /><button onClick={() => setNudges((items) => items.filter((item) => item.id !== nudge.id))} aria-label="Dismiss nudge"><X /></button><strong>{nudge.title}</strong><p>{nudge.message}</p></article>)}</div><section className="status-section"><div className="summary-heading"><h3>Overall completion</h3><strong>{completion}%</strong></div><div className="segment-bar" aria-label={`${completion}% complete`}>{Array.from({ length: 20 }, (_, index) => <i className={index < Math.round(completion / 5) ? "filled" : ""} key={index} />)}</div></section><section className="status-section"><h3>Features by phase</h3><div className="phase-bars">{phaseCounts.map((phase) => <div key={phase.id}><span>{phase.name}</span><div><i style={{ width: `${Math.max(8, state.features.length ? (phase.count / state.features.length) * 100 : 0)}%` }} /></div><b>{phase.count}</b></div>)}</div></section><div className="summary-columns"><section className="status-section"><h3>Open priority</h3>{priorities.map((priority) => <div className="metric-line" key={priority.id}><span><i className={`mini-pin pin-${priority.id}`} />{priority.label}</span><b>{outstanding.filter((feature) => feature.priority === priority.id).length}</b></div>)}</section><section className="status-section"><h3>Open workload</h3>{workloads.map(([name, count]) => <div className="metric-line" key={name}><span className="person"><i className="ink-stamp mini">{initials(name)}</i>{name}</span><b>{count}</b></div>)}</section></div></DialogContent></Dialog>
    <AlertDialog open={Boolean(deletePhaseId)} onOpenChange={(open) => !open && setDeletePhaseId(null)}><AlertDialogContent className="memo-dialog"><AlertDialogHeader><AlertDialogTitle>Remove this phase?</AlertDialogTitle><AlertDialogDescription>Its notes will move to the first remaining phase. The move will be recorded in each note’s history.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>Keep phase</AlertDialogCancel><AlertDialogAction onClick={deletePhase}>Remove phase</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
  </main>;
}
