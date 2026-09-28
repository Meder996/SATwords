export const DAY = 86400000;
export const localDay = (date = new Date()) => `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
export const todayStart = () => new Date().setHours(0,0,0,0);
export const initialState = { states: {}, activity: {}, sessions: [], xp: 0, settings: { dailyGoal: 10, targetDate: '', reminder: '19:00', theme: 'dark' } };
export function reviewWord(previous = {}, rating, now = Date.now()) {
  const ease = previous.easeFactor ?? 2.5;
  const reps = previous.repetitions ?? 0;
  const oldInterval = previous.interval ?? 0;
  let interval, repetitions, easeFactor;
  if (rating === 1) { interval = 0; repetitions = 0; easeFactor = Math.max(1.3, ease - 0.2); }
  else if (rating === 2) { interval = Math.max(1, Math.round((oldInterval || 1) * 1.2)); repetitions = Math.max(1, reps); easeFactor = Math.max(1.3, ease - 0.15); }
  else if (rating === 3) { repetitions = reps + 1; interval = reps === 0 ? 1 : reps === 1 ? 6 : Math.max(1, Math.round(oldInterval * ease)); easeFactor = ease; }
  else if (rating === 4) { repetitions = reps + 1; interval = reps === 0 ? 4 : reps === 1 ? 10 : Math.max(1, Math.round(oldInterval * (ease + 0.3))); easeFactor = Math.min(3.5, ease + 0.15); }
  else throw new Error('Invalid rating');
  const totalCorrect = (previous.totalCorrect || 0) + (rating > 1 ? 1 : 0);
  const totalIncorrect = (previous.totalIncorrect || 0) + (rating === 1 ? 1 : 0);
  const masteryLevel = rating === 1 ? 1 : interval > 90 && repetitions >= 6 ? 5 : interval > 30 ? 4 : interval > 10 ? 3 : interval > 3 ? 2 : 1;
  return { easeFactor, interval, repetitions, nextReviewDate: now + interval * DAY, masteryLevel, totalCorrect, totalIncorrect, updatedAt: now };
}
export function getQueue(words, states, limit = 10, now = Date.now()) {
  const due = words.filter(w => states[w.id] && states[w.id].nextReviewDate <= now).sort((a,b) => states[a.id].nextReviewDate - states[b.id].nextReviewDate);
  const unseen = words.filter(w => !states[w.id]);
  return [...due.slice(0,limit), ...unseen.slice(0,Math.max(0,limit-due.length))];
}
export function statsFor(data, words, now = Date.now()) {
  const states = Object.values(data.states);
  const reviewed = states.length;
  const mastered = states.filter(s => s.masteryLevel >= 4).length;
  const due = states.filter(s => s.nextReviewDate <= now).length;
  const days = Object.keys(data.activity).filter(d => data.activity[d] > 0).sort().reverse();
  let streak = 0; const cursor = new Date(now); cursor.setHours(12,0,0,0);
  if (days[0] !== localDay(cursor)) cursor.setDate(cursor.getDate()-1);
  while (data.activity[localDay(cursor)] > 0) { streak++; cursor.setDate(cursor.getDate()-1); }
  const studiedToday = data.activity[localDay(new Date(now))] || 0;
  return { reviewed, mastered, due, newWords: words.length-reviewed, streak, studiedToday };
}
export function awardReview(data, wordId, rating, now = Date.now()) {
  const day = localDay(new Date(now));
  return { ...data, states: { ...data.states, [wordId]: reviewWord(data.states[wordId],rating,now) }, activity: { ...data.activity, [day]: (data.activity[day] || 0)+1 }, xp: data.xp+10 };
}
export function awardPractice(data, mode, correct, wordsReviewed = 1, now = Date.now()) {
  const day = localDay(new Date(now));
  const earned = mode === 'match' ? (correct ? 50 : 0) : correct ? 25 : 0;
  return { ...data, xp: data.xp + earned, activity: { ...data.activity, [day]: (data.activity[day] || 0)+wordsReviewed }, sessions: [{ id: `${now}-${Math.random().toString(36).slice(2,7)}`, timestamp: now, mode, wordsReviewed, correct: correct ? 1 : 0, xp: earned }, ...data.sessions].slice(0,500) };
}
