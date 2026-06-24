const text = value => typeof value === 'string' && value.trim().length > 0

export const validators = {
  liveSignal: data => data && text(data.condition) && text(data.learnerImpact) && text(data.watchFor),
  lenses: data => Array.isArray(data?.lenses) && data.lenses.length === 5 && data.lenses.every(item => text(item.id) && text(item.provocation) && text(item.example)),
  concepts: data => Array.isArray(data?.concepts) && data.concepts.length >= 2 && data.concepts.every(item => text(item.name) && text(item.tension) && Array.isArray(item.roles) && text(item.action) && text(item.rationale)),
  moves: data => Array.isArray(data?.moves) && data.moves.length >= 3 && data.moves.every(item => text(item.title) && text(item.description) && text(item.implementation)),
  outputBrief: data => data && text(data.arenaConcept) && data.sections && ['conditions', 'constraints', 'choices', 'evidence', 'interventions'].every(key => text(data.sections[key])) && text(data.gamemakersNote),
}

export const schemas = {
  liveSignal: { condition: 'string', learnerImpact: 'string', watchFor: 'string' },
  lenses: { lenses: [{ id: 'tension|role|stakes|surprise|constraint', provocation: 'string', example: 'string' }] },
  concepts: { concepts: [{ id: 'string', name: 'string', tension: 'string', roles: ['string'], action: 'string', rationale: 'string' }] },
  moves: { moves: [{ id: 'string', title: 'string', description: 'string', implementation: 'string' }] },
  outputBrief: { arenaConcept: 'string', sections: { conditions: 'string', constraints: 'string', choices: 'string', evidence: 'string', interventions: 'string' }, gamemakersNote: 'string' },
}
