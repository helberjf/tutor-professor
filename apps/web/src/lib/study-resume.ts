import { api, type StudyResumeUpdatePayload } from '@/lib/api';

/** Save navigation state without ever delaying or breaking the study screen. */
export function rememberStudyLocation(payload: StudyResumeUpdatePayload) {
  void api.saveStudyResume(payload).catch(() => undefined);
}
