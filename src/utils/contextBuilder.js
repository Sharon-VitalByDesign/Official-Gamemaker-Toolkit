export function buildArenaContext(state) {
  const lensMap = new Map((state.lensContent || []).map(item => [item.id, item]))
  const selectedLensDetails = (state.selectedLenses || []).map(id => {
    const details = lensMap.get(id)
    return details ? { id: details.id, provocation: details.provocation, example: details.example } : { id }
  })
  return {
    topic: state.topic,
    gradeLevel: state.grade,
    selectedLenses: state.selectedLenses,
    selectedLensDetails,
    arenaConcept: state.selectedConcept,
    roles: state.selectedConcept?.roles || [],
    definition: state.framing,
    dialSettings: state.controls,
    faderSettings: state.faders,
    selectedMoves: state.selectedMoves,
    standards: state.standards,
    regeneratePrompt: state.regeneratePrompt || '',
  }
}

export function buildOutputBriefContext(state) {
  const lensMap = new Map((state.lensContent || []).map(item => [item.id, item]))
  const selectedLensDetails = (state.selectedLenses || []).map(id => {
    const details = lensMap.get(id)
    return details ? { id: details.id, provocation: details.provocation, example: details.example } : { id }
  })

  return {
    topic: state.topic,
    gradeLevel: state.grade,
    selectedLenses: state.selectedLenses,
    selectedLensDetails,
    arenaConcept: state.selectedConcept ? {
      name: state.selectedConcept.name,
      tension: state.selectedConcept.tension,
      roles: state.selectedConcept.roles,
      action: state.selectedConcept.action,
      rationale: state.selectedConcept.rationale,
    } : null,
    definition: state.framing,
    dialSettings: state.controls,
    faderSettings: state.faders,
    selectedMoves: state.selectedMoves,
    standards: state.standards,
  }
}
