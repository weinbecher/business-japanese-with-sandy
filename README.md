# Business Japanese with Sandy

An independent static website based on the chapter and expression scope of
『人を動かす 実戦ビジネス日本語会話 中級1』
（一般財団法人国際教育振興会 日米会話学院日本語研修所）.

The ocean palette, green-eyed Sandy, audio, filtering, handwriting board and review
workflow follow the existing Study with Sandy website. This project has its own
content, authentication session, learning records and Git repository.

## Content and pages

| Page | Content |
| --- | --- |
| `index.html` | 36 two-choice business communication questions, four per chapter |
| `grammar-quiz.html` | 61 four-choice example-sentence questions |
| `grammar.html` | All 61 expression headings from the nine textbook chapters |
| `vocab.html` | 162 selected core words, with kana first and kana sorting |
| `conversations.html` | Nine chapter dialogues and eighteen functional role plays |
| `mistakes.html` | Combined starred items and wrong answers, reason tags and backups |
| `tag.html` | Grouped multi-select filters and links to individual tag lists |
| `textbook.html` | Chapter map and private, locally imported textbook PDF |
| `login.html` | Existing Sandy account sign-in, registration and password recovery |

Chapter and expression headings were checked against the supplied 55-page scanned
PDF. The 162-word bank is a selection of core vocabulary, not a complete transcription
of every word in the textbook. Japanese examples, dialogues, questions, explanations,
Chinese translations and English hints are original study aids. They are not official
publisher exercises or audio. The PDF and publisher audio are not distributed here.

The expression count per chapter is **6, 7, 6, 8, 7, 6, 8, 7, 6** (61 total).
The two `次第` entries and the two `限り` entries retain their separate textbook functions.

## Open the project

Open `index.html` directly, or run `python3 preview.py` for the local preview at
`http://127.0.0.1:8765`. The preview binds to the local machine only, serves a fixed
allowlist of site pages and assets, and does not expose the PDF, backups or Git files.

All study content uses regular local scripts, so there is no build step and no npm
installation. Publish the HTML pages and `assets/` folder to a separate GitHub Pages
repository when ready. No remote repository or deployment is configured by default.

## Progress, review and account isolation

- Without sign-in, records are stored under `business-sandy:v1:guest` in this browser.
- Signed-in records are stored under `business-sandy:v1:<user-id>` and synced with
  the existing Sandy Supabase account using its public client key and protected
  `mistake_notebook` table. No service-role key is used.
- The reserved snapshot ID `vocab-progress-business-japanese-v1` is intentionally
  skipped by the existing N2 site's cloud readers. It contains only this project's
  progress, answers, favorites, reason tags and preferences. It does not modify N2
  sessions, attempts, favorites or progress.
- Item records are merged by modification time; removed review items remain as
  tombstones so an older device cannot silently restore them. Cloud writes compare
  the previous revision and retry on a concurrent update.
- Guest records are merged once into the first account used on this website.
- Signing out keeps that account's records. Signing in again restores them.
- Browser data does not transfer from `file:` to localhost or a hosted domain by
  itself. Use sign-in or export/import the JSON backup to transfer it. Clearing
  browser data removes local-only records. PDF imports remain local to each browser.
- Email confirmation and recovery on a new hosted domain require adding that
  `login.html` URL to the Supabase Auth redirect allowlist. Password sign-in uses
  the existing account. The app remains usable offline without cloud access.

## Audio and interactions

Audio uses the device's Japanese speech-synthesis voices. Choose a Japanese voice
in the toolbar. Only Japanese words and sentences are narrated, never Chinese or
English translations or the heading "example". Device voice quality varies.

Click Sandy to start or stop listening; drag her to move her. She stays still and
shows `…` during reading. The heart pets her, and snacks can be dragged to her.
Correct answers receive an inline explanation and can trigger her quiet meow.

Automatic listening continues from the current/saved card. In quiz pages it waits
for an answer before reading the complete sentence, then scrolls forward. On the
dialogue page, choose your role: Sandy reads the other turns and waits for you to
click “我说完了” on your turn. No microphone, recording or remote voice service is used.

The handwriting board follows the current item, supports pointer pressure for
Apple Pencil, can be collapsed, dragged and resized, and has a clear button.

## Add content

- Expressions: add an `e(...)` entry in `assets/data.js`; mark the answer with `{{…}}`.
- Words: add a row to the appropriate chapter in `assets/vocab.js`.
- Dialogues: add a `d(...)` entry in `assets/dialogues.js`.
- Two-choice questions: add a `t(...)` entry in `assets/traps.js`.

Keep IDs stable when updating content so existing learning records still resolve.
Shared presentation and behavior live in `assets/app.css` and `assets/app.js`.
