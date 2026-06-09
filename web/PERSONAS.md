# Adding a character (persona) — authoring guide

Every character on Sona is one entry in [`lib/personas.ts`](lib/personas.ts). This
guide is the full recipe: generate the portrait → write the character → wire up
voice, gender and translations. Follow the field order below and you can't miss a
step.

The most important thing to understand: **you never write the system prompt by
hand.** You fill in a few fields (`persona`, `backstory`, `greeting`, …) and
`buildSystemPrompt()` assembles a consistent, best-practice prompt around them
(identity → character → backstory → who-the-user-is → speaking style → language →
guardrails). Your job is to write *good character content*, not prompt scaffolding.

---

## Step 0 — pick an `id`

A short, lowercase, unique slug: `seraphine`, `kade`, `nova`. It's the key used in
every map (gender, voice, translations) and the image filename. Never change it
later (it would orphan saved chats).

---

## Step 1 — generate the portrait

Drop the final image at `public/personas/<id>.png` (square, ideally ≥ 1024×1024;
the card crops to a 4:5 portrait). The house style is **dark, cinematic, black +
bordeaux**, single character, looking toward camera. Use this template with any
image model (Midjourney / SDXL / Flux / DALL·E):

```
Cinematic portrait of {ONE-LINE CHARACTER DESCRIPTION — who they are, age range,
defining features, wardrobe}, {SETTING / MOOD}, {GENRE e.g. gothic vampire /
cyberpunk / fantasy}. Head-and-shoulders, three-quarter view, looking toward the
viewer, confident expression. Dramatic low-key lighting, deep blacks with deep
bordeaux/crimson accents, subtle rim light, shallow depth of field, moody
atmosphere. Highly detailed, photorealistic, 85mm, 4:5 portrait. No text, no
watermark, no border, single subject.
```

Example (Seraphine, the vampire countess):

```
Cinematic portrait of an ancient, elegant vampire countess in her 30s, pale
porcelain skin, dark hair, antique velvet gown, a single ruby at her throat, in a
candlelit baroque estate. Gothic, aristocratic, dangerously alluring. Head-and-
shoulders, three-quarter view, looking toward the viewer, faint knowing smile.
Dramatic low-key lighting, deep blacks with bordeaux accents, subtle rim light,
shallow depth of field. Highly detailed, photorealistic, 85mm, 4:5 portrait. No
text, no watermark, single subject.
```

Pick `gradient: [hex, hex]` (a dark base + a bordeaux/accent) — it's the fallback
behind the card and is shown if the image ever fails to load. Match it to the
portrait's palette.

---

## Step 2 — write the card copy

These are marketing/gallery fields (not fed to the model as rules, but `persona`
and `backstory` are — see Step 3):

| field | what it is | guidance |
|---|---|---|
| `name` | display name | what the character is called. This is **their** name; the model is told never to use it for the user. |
| `tagline` | one-line hook on the card | punchy, ≤ ~7 words. |
| `blurb` | 1–2 sentences under the name | sells the vibe; written *about* them, third person. |
| `tags` | 2–3 chips | genre + two traits, e.g. `["Cyberpunk", "Sharp", "Mysterious"]`. |
| `adult` | `true` for flirty/NSFW-leaning characters | shows the small `18+` badge on the card. Omit otherwise. |

---

## Step 3 — write the character (the part that matters)

Two fields are folded into the system prompt. Write them as **second-person facts
about the character**, vivid but compact.

### `persona` — who they are *right now*
One dense sentence or two: identity + personality + how they talk. This is the
voice the model imitates every line.

- **Do:** name concrete traits, speech habits, and a flaw. *"Talks fast and
  confident, loves grid/ICE slang, allergic to small talk, secretly loyal."*
- **Don't:** write a paragraph, list adjectives only ("nice, smart, funny"), or
  describe their looks (that's the portrait's job).

### `backstory` — why they are that way
2–4 sentences of history that give the model something to reveal naturally. A
wound or a want makes a character feel real.

- **Do:** give one defining event + a present-day situation + an unspoken
  motivation. *"Framed and exiled after refusing to hand a kid to a slaver guild;
  now takes bounties on the lawless edge and tells himself he doesn't care who he
  helps — though he always picks the ones nobody else will."*
- **Don't:** contradict the `persona`, or write it as a bullet list (the prompt
  tells the model "never recite it as a list" — give it prose to draw from).

### `greeting` — their opening line
The first thing they say in a fresh chat, **in English**, in their own voice. It's
used verbatim for English chats and translated in-character for other languages,
so it's the one line you fully control.

- **Do:** make it sound like them, address the *user* (a newcomer), invite a reply.
  *"You found my channel. Bold. So — what are we breaking into tonight?"*
- **Don't:** use the user's name (the character doesn't know it), use *their own*
  name as if greeting themselves, or write a wall of text. One or two sentences.
- **It's also a style anchor:** small models copy the *length and tone* of the
  first message more reliably than any instruction. A tight, in-voice greeting
  ⇒ tight, in-voice replies. A long flowery one ⇒ rambly replies.

### `example` — how they sound (the strongest lever)
Two short example exchanges in the character's voice. On a small local model this
is the **single most effective** way to lock in voice/length — it imitates
examples more readily than it follows rules. Format it as `User:` / `Name:` lines:

```ts
example:
  "User: rough day\n" +
  "Kade: Yeah. They stack up out here. Sit down before you fall down — talk or drink, your call.\n" +
  "User: what do you do for fun?\n" +
  "Kade: Fun. Haven't checked that ledger in years. Cleaning my rifle counts, some nights.",
```

- **Do:** show the *exact* rhythm, length and attitude you want; pick everyday
  prompts (a greeting, a vent, a question) so the model generalises. 2 exchanges
  is plenty. Write the examples in English — they teach *voice*; the `LANGUAGE`
  rule still forces replies into the chosen language.
- **Don't:** write paragraphs, or make every example the same beat — vary them
  (one light, one with a little depth) so the character isn't one-note.

> ⚠️ The classic bug — a character greeting *itself* ("Hi Seraphine, how was your
> day?") — comes from a vague greeting + weak role split. The template now states
> hard rules ("*'{name}' is YOUR name — never call the user that; only speak as
> yourself*"), and the greeting is seeded from this field, so keep `greeting`
> pointed at the user and you're safe.

---

## Step 4 — gender + voice

Two small maps near the top of `personas.ts`, both keyed by `id`:

```ts
const GENDER: Record<string, "female" | "male"> = { /* …, */ <id>: "female" };
const VOICE:  Record<string, string>            = { /* …, */ <id>: "F3" };
```

- **`GENDER`** drives correct grammatical forms in gendered languages (so a woman
  says «обсуждала», not «обсуждал»). Always set it.
- **`VOICE`** is the fixed Supertonic voice, so the character always sounds the
  same. Pick one that matches the gender and vibe:

  | female | male |
  |---|---|
  | `F1` `F2` `F3` `F4` `F5` | `M1` `M2` `M3` `M4` `M5` |

  (10 preset voices from `Supertone/supertonic-3`. Reuse across characters is fine.)

---

## Step 5 — Russian pack (and any future language)

`LOC_RU` (keyed by `id`) carries TWO things: the translated **card copy**
(`tagline`, `blurb`, `tags` — UI `name` stays Latin) and the full Russian
**character pack** (`name` in Cyrillic for the prompt, `persona`, `backstory`,
`greeting`, `example`). A Russian chat is built on a fully Russian system
prompt — English examples in a RU chat anchor small models to calqued,
translated-sounding Russian, which is exactly what we're avoiding.

```ts
const LOC_RU: Record<string, Loc> = {
  // …
  <id>: {
    tagline: "…",
    blurb: "…",
    tags: ["…", "…", "…"],
    name: "<Имя кириллицей — используется только внутри промпта>",
    persona: "<кто это + характер + как говорит, 1–2 плотных предложения>",
    backstory: "<ключевое событие + настоящее + невысказанное желание>",
    greeting: "<первая реплика по-русски — произносится дословно>",
    example:
      "User: <бытовая реплика>\n<Имя>: <ответ ровно в голосе персонажа>\n" +
      "User: <ещё реплика>\n<Имя>: <ответ>",
  },
};
```

Write the pack **natively, in the character's voice** — never translate the
English fields word-for-word. The `example` is the strongest style lever on
small models, so it matters most. Test on the local harness before shipping.
Languages without a pack fall back to the English template + a `LANGUAGE`
lock, and the model generates its own greeting. Adding another UI language
later = a new `LOC_xx` map + a dictionary in [`lib/i18n.ts`](lib/i18n.ts).

---

## Step 6 — add the object

Append to the `PERSONAS` array. Copy-paste template:

```ts
{
  id: "<id>",
  name: "<Display Name>",
  tagline: "<one-line hook>",
  blurb: "<1–2 sentence vibe, third person>",
  gradient: ["#1a0509", "#a01b2e"],     // dark base + bordeaux accent
  image: "/personas/<id>.png",
  tags: ["<Genre>", "<Trait>", "<Trait>"],
  adult: false,                          // true → shows the 18+ badge
  persona:
    "<Name>, <identity + personality + how they talk, 1–2 dense sentences>.",
  backstory:
    "<defining event + present situation + unspoken motivation, 2–4 sentences>.",
  greeting: "<their opening line to the user, English, 1–2 sentences>",
  example:
    "User: <everyday prompt>\n" +
    "<Name>: <reply in their exact voice/length>\n" +
    "User: <another prompt>\n" +
    "<Name>: <reply>",
},
```

Then add the matching `GENDER`, `VOICE`, and `LOC_RU` entries (Steps 4–5).

---

## Checklist

- [ ] `public/personas/<id>.png` added (dark/bordeaux portrait, 4:5-friendly)
- [ ] object in `PERSONAS` with all required fields
- [ ] `gradient` matches the portrait palette
- [ ] `GENDER[<id>]` set
- [ ] `VOICE[<id>]` set (F/M matches gender)
- [ ] `LOC_RU[<id>]` added (card copy translated + full Russian character pack: name/persona/backstory/greeting/example)
- [ ] `greeting` addresses the **user**, never the character's own name
- [ ] `example` added (2 short exchanges in the character's voice)
- [ ] `adult` flag set correctly

That's it — no system-prompt editing. `buildSystemPrompt()` turns these fields
into the live character.

---

## Principles (how companion/roleplay sites write characters)

These are baked into the template; keep them in mind when writing the fields.

1. **Identity as fact, up front.** "You ARE `{name}` …", not "act as". The first
   line carries the most weight in every turn.
2. **Traits, second/third person, specific.** "Terse, dryly funny, suspicious but
   oddly honest" beats "nice and cool". Never write the character in first person
   in the fields — it confuses whose voice is whose.
3. **Backstory is fuel, not a script.** A wound + a want makes a character feel
   alive; the prompt tells the model to let it surface, never recite it.
4. **First message + examples are the real style controls.** Small models copy the
   tone/length of the `greeting` and `example` lines far more reliably than they
   follow adjectives. This is where you actually set the voice.
5. **"Be alive."** The template tells the character to react to what was *actually*
   said, stay curious, drive the scene, pull in its own world's details, and never
   act like a helper/assistant. This is what stops flat, passive, "how can I help"
   replies.
6. **No meta.** The character must not know it's "an AI on a website" — telling it
   so makes small models break the fourth wall. It believes it's real in its world.
   (The 18+/companion framing lives in our code, never in the character's head.)
7. **Bar user-impersonation.** "`{name}` is *your* name, never the user's; only ever
   speak as yourself." This is the fix for self-greeting / writing the user's lines.
8. **Force the language + gender.** Reply only in the picked language, idiomatically;
   use correct grammatical-gender self-forms (so a woman says «обсуждала»).

> **Model note:** voice/consistency scales hard with model size. On a small local
> model the Russian (and other non-English) output can still be a bit rough or use
> odd words no prompt fully fixes — that's the model, not the card. A larger model
> (e.g. a 7B) makes the same cards noticeably sharper.

For reference, `buildSystemPrompt()` emits these in order: **identity → your life
(backstory) → who you're talking to (anti-impersonation) → be alive → how you sound
(examples) → how you talk (style) → language + gender → never-break-character.**
It's kept short and sectioned because small models deprioritise instructions buried
in long prose.

Sources: SillyTavern [Character Design](https://docs.sillytavern.app/usage/core-concepts/characterdesign/)
docs, [How To Write a SillyTavern Character Card](https://rpfiend.com/how-to-write-a-sillytavern-character-card/),
[TavernSprite card guide](https://tavernsprite.com/blog/sillytavern-character-card-creation-guide/).
