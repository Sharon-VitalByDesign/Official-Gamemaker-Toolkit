const text = value => typeof value === 'string' && value.trim().length > 0

export const validators = {
  liveSignal: data => data && text(data.condition) && text(data.learnerImpact) && text(data.watchFor),
  faderDescriptions: data => data && ['time', 'access', 'ambiguity', 'information', 'autonomy', 'stakes', 'collaboration', 'feedback'].every(key => {
    const group = data[key]
    return group && [1, 2, 3, 4, 5].every(value => text(group[value]))
  }),
  lenses: data => Array.isArray(data?.lenses) && data.lenses.length === 5 && data.lenses.every(item => text(item.id) && text(item.provocation) && text(item.example)),
  concepts: data => Array.isArray(data?.concepts) && data.concepts.length >= 2 && data.concepts.every(item => text(item.name) && text(item.tension) && Array.isArray(item.roles) && item.roles.every(text) && text(item.action) && text(item.rationale)),
  lensSpecificConcept: data => data && data.concept && text(data.concept.name) && text(data.concept.tension) && Array.isArray(data.concept.roles) && data.concept.roles.every(text) && text(data.concept.action) && text(data.concept.rationale),
  moves: data => Array.isArray(data?.moves) && data.moves.length >= 3 && data.moves.every(item => text(item.title) && text(item.description) && text(item.implementation)),
  outputBrief: data => data && text(data.arenaConcept) && data.sections && ['conditions', 'constraints', 'choices', 'evidence', 'interventions'].every(key => text(data.sections[key])) && text(data.gamemakersNote),
}

export const schemas = {
  liveSignal: { condition: 'string', learnerImpact: 'string', watchFor: 'string' },
  faderDescriptions: {
    time: { 1: 'string', 2: 'string', 3: 'string', 4: 'string', 5: 'string' },
    access: { 1: 'string', 2: 'string', 3: 'string', 4: 'string', 5: 'string' },
    ambiguity: { 1: 'string', 2: 'string', 3: 'string', 4: 'string', 5: 'string' },
    information: { 1: 'string', 2: 'string', 3: 'string', 4: 'string', 5: 'string' },
    autonomy: { 1: 'string', 2: 'string', 3: 'string', 4: 'string', 5: 'string' },
    stakes: { 1: 'string', 2: 'string', 3: 'string', 4: 'string', 5: 'string' },
    collaboration: { 1: 'string', 2: 'string', 3: 'string', 4: 'string', 5: 'string' },
    feedback: { 1: 'string', 2: 'string', 3: 'string', 4: 'string', 5: 'string' },
  },
  lenses: { lenses: [{ id: 'tension|role|stakes|surprise|constraint', provocation: 'string', example: 'string' }] },
  concepts: { concepts: [{ id: 'string', name: 'string', tension: 'string', roles: ['string'], action: 'string', rationale: 'string' }] },
  lensSpecificConcept: { concept: { id: 'string', name: 'string', tension: 'string', roles: ['string'], action: 'string', rationale: 'string' } },
  moves: { moves: [{ id: 'string', title: 'string', description: 'string', implementation: 'string' }] },
  outputBrief: { arenaConcept: 'string', sections: { conditions: 'string', constraints: 'string', choices: 'string', evidence: 'string', interventions: 'string' }, gamemakersNote: 'string' },
}
