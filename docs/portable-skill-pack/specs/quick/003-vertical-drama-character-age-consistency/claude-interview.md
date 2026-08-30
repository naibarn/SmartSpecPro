# Interview Transcript

## Product decision captured from the request

**Question:** Should casting use one universal age or derive the range from each story?

**Answer:** Derive it from each character's DNA and story role. A student may be
17–19, a working adult may be 22–25, and an intentionally older lead may be 30–35.
The range must be dynamic per story and per character, while remaining identical across
all candidates in one batch. Leads with a deliberate age gap must receive separate
ranges.

## Scope decisions carried from the approved casting design

- The feature is limited to generating casting images and letting the user choose a
  primary portrait or regenerate.
- Reference images remain optional and are guidelines for a new fictional person.
- The existing no-reference flow remains functional and downstream production flows are
  out of scope.
- The user does not need to type an age. A derived age explanation may be shown read-only.
