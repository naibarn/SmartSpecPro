// Thai vowel and tone marks (and other Unicode combining marks) can follow the first character.
export const AUTO_REVIEW_PUBLISH_HASHTAG = /^#[\p{L}\p{N}_][\p{L}\p{M}\p{N}_]{0,79}$/u;
export const AUTO_REVIEW_PUBLISH_MAX_HASHTAGS = 20;
