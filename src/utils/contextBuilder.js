export function buildArenaContext(state) {
  return {
    topic: state.topic,
    gradeLevel: state.grade,
    selectedLenses: state.selectedLenses,
    arenaConcept: state.selectedConcept,
    roles: state.selectedConcept?.roles || [],
    definition: state.framing,
    dialSettings: state.controls,
    faderSettings: state.faders,
    selectedMoves: state.selectedMoves,
    standards: state.standards,
  }
}
