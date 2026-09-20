import { ACCOUNT_EN } from './account';
import { CODING_EN } from './coding';
import { COMMON_EN } from './common';
import { STUDY_EN } from './study';

/**
 * Portuguese source text → English.
 *
 * Split by area only so the files stay readable; at runtime it is one flat
 * lookup. A string that is absent falls back to the Portuguese it was written
 * in, which is why partial coverage degrades into a mixed screen rather than a
 * broken one.
 */
export const EN_DICTIONARY: Record<string, string> = {
  ...COMMON_EN,
  ...ACCOUNT_EN,
  ...STUDY_EN,
  ...CODING_EN,
};
