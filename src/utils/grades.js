export const gradeOptions = [
  'Pre-K',
  'Kindergarten',
  'Grade 1',
  'Grade 2',
  'Grade 3',
  'Grade 4',
  'Grade 5',
  'Grade 6',
  'Grade 7',
  'Grade 8',
  'Grade 9',
  'Grade 10',
  'Grade 11',
  'Grade 12',
  'College',
  'Adult Learners',
]

export function formatGradeDescriptor(grade) {
  if (!grade) return 'learners'
  if (grade === 'Pre-K') return 'Pre-K learners'
  if (grade === 'Kindergarten') return 'Kindergarten learners'
  if (grade === 'College') return 'college learners'
  if (grade === 'Adult Learners') return 'adult learners'
  return `${grade} learners`
}
