# Business Japanese with Sandy

Source repository: [weinbecher/business-japanese-with-sandy](https://github.com/weinbecher/business-japanese-with-sandy).

An independent static website based on the chapter and expression scope of
『人を動かす 実戦ビジネス日本語会話 中級1』
（一般財団法人国際教育振興会 日米会話学院日本語研修所）.

The ocean palette, green-eyed Sandy, audio, filtering, handwriting board and review
workflow follow the existing Study with Sandy website. This project has its own
content, authentication session, learning records and Git repository.

## Content and pages

| Page | Content |
| --- | --- |
| `home.html` | Continue the last learning position, learn/practise/review routes and nine scene-based chapters |
| `index.html` | 36 two-choice business communication questions, four per chapter |
| `grammar-quiz.html` | 61 four-choice example-sentence questions |
| `grammar.html` | All 61 expression headings from the nine textbook chapters |
| `vocab.html` | 162 selected core words, with kana first and kana sorting |
| `conversations.html` | Nine chapter dialogues and eighteen functional role plays |
| `mistakes.html` | Combined starred items and wrong answers, reason tags and backups |
| `shadow-words.html` | Words explicitly starred after a shadowing check, with word/sentence audio, reason tags and automatic review |
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

Open `home.html` directly, or run `python3 preview.py` for the local preview at
`http://127.0.0.1:8765`. The preview binds to the local machine only, serves a fixed
allowlist of site pages and assets, and does not expose the PDF, backups or Git files.

All study content uses regular local scripts, so there is no build step and no npm
installation. The app code is backed up in its separate GitHub repository;
the textbook PDF, downloaded model, recordings and local learning backups are excluded.
GitHub Pages publishes the static study website independently of this Mac.
Local Whisper recognition still requires the loopback server on this Mac.

### Online hosting: GitHub Pages

On 2026-10-06 the owner requested switching to a public repository and GitHub
Pages after a private Sites publishing attempt was blocked. The source code and
static study pages are public; personal learning records are not repository files.
The textbook PDF and publisher audio are not distributed.

The learning homepage is
[Business Japanese with Sandy](https://weinbecher.github.io/business-japanese-with-sandy/home.html).
Configure GitHub Pages to **Deploy from a branch → main → / (root)**. The
tracked `.nojekyll` file publishes these plain HTML/JS assets without Jekyll.
After Pages is enabled, pushing a new commit to `main` updates the website;
verify that its Pages build succeeds before reporting an update as live.

The static online conversation page defaults to iPad/system dictation. Whisper
still runs only on your Mac's local or configured private Tailscale page; the
online edition does not send microphone audio to a public recognition service.
The public study website needs no ChatGPT sign-in. The optional Sandy learning
account is for progress and review sync. Sign in to the same account or import a backup to transfer
progress from localhost; guest records are browser/origin-local.

The earlier Sites registration remains unpublished and is not the active host.
Its separate `online-site/` checkout and manifest are deliberately git-ignored;
do not upload them or their Git metadata. The optional `prepare-online-site.mjs`
script copies only eleven pages and ten public assets there for local checks;
GitHub Pages does not depend on that ignored checkout or the Sites publisher.

## Navigation

All pages use the same persistent, grouped navigation instead of eight equal-weight
buttons. **Learn** contains vocabulary and expressions; **Practise** contains
conversation shadowing, expression blanks and business judgments; **Review**
contains mistakes, starred content and the shadowing word notebook. Tags and the source PDF are secondary tools.
The original URLs and anchors still work, including `index.html` for two-choice
practice. The local server root and launcher open `home.html`.

Desktop uses a fixed sidebar and sticky breadcrumbs. Mobile uses four fixed tabs
(home, learn, practise, review), contextual links and an expandable full menu with
Escape/outside-click dismissal. Opening the menu moves keyboard focus into it.
The floating Sandy and handwriting tools sit above the mobile bottom navigation.

The home page resumes the newest valid **learning** progress, not an incidental
visit to the review or tag browser. It does not overwrite progress just by opening.
Chapter links point to each chapter's actual vocabulary, expression and dialogue
IDs. An unanswered quiz resumes with the blank sentence, not its grammar answer.
Review counts omit archived and mastered records. All original account isolation,
local speech, Japanese audio and per-page progress handling remain in place.

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
click “我说完了” on your turn.

The **跟读方式** selector offers both **Mac Whisper** and **iPad / 系统听写**.
The choice is remembered only on this browser/site, separately from learning
accounts and backups. Changing modes stops any current recording and never starts
another one automatically. A local/private Mac page defaults to Whisper; a static
hosted page defaults to system dictation. `?speech=whisper` or `?speech=dictation`
can explicitly choose the initial mode without changing the stored preference.

In Whisper mode each dialogue line has a **跟读检查** microphone button. It uses
**local Whisper.cpp v1.9.4 with the multilingual small-q5_1 model**, not the browser's
`SpeechRecognition` service. It runs on this Mac's CPU, has no API fee or key,
and makes no network requests during transcription. The browser only captures
microphone PCM with AudioWorklet, converts it to mono 16 kHz WAV, and sends it to
the same-origin Mac server after explicit consent and microphone permission,
either directly on localhost or through an explicitly configured private HTTPS
Tailscale Serve proxy. The remote disclosure names the receiving Mac hostname.
The app's recording disclosure is acknowledged once and remembered for this
browser/site, including page reloads and account changes. It is stored separately
from learning records and never synced or exported. Clearing site data or using
another browser/address requires acknowledgement again. Browser/OS microphone
permissions remain separate and cannot be bypassed; recording still starts only
when you click a line's microphone button. If storage is blocked, acknowledgement
lasts for the current page session only.
During reading, karaoke-style highlighting follows the local partial transcript
on the original Japanese line: blue indicates corresponding text, an underline shows
the estimated current word, amber indicates a provisional mismatch, and muted words
have not yet been reached. An unspoken suffix is never called missing while reading.
Each new hypothesis replaces the previous alignment, including revisions or removed
interim text; unrelated text does not invent a reading position. Highlights are static,
not animated, and may lag or jump when the speech service returns text in chunks.

Whisper processes cumulative snapshots approximately every three seconds, with
only one inference at a time. CPU speed determines the actual delay; this is not
word-by-word low-latency streaming. The microphone level and processing state are
visible. Click **停止并比对** when finished: hardware recording stops immediately,
an in-flight partial job is cancelled, and the final audio is transcribed afresh.
Each recording is capped at 60 seconds; permission and processing have bounded
timeouts. Empty or silent audio is not graded. The expected sentence is never
sent to Whisper as a prompt. The final result highlights possibly missing, different and extra text segments
against that line. It ignores punctuation, spacing, full-width differences and katakana vs
hiragana, and uses Japanese word segmentation with a character fallback. Different
kanji/kana spellings can still be flagged; always verify by listening to the original.
This is text matching, **not pronunciation, accent or intonation scoring**.

Click a highlighted source word to hear only that correct word. During an active
recording this stops recognition before playback, so speaker audio cannot become
microphone input. After final comparison, missing/different source spans have a
star button: only an explicit click adds them to the shadowing word notebook.
Repeated checks of the same source span update one record rather than duplicating
it. Extra recognized text has no correct source word and is not offered for saving.
The notebook also appears in combined review and tag filters; click a word for
word-only audio, click its sentence for sentence-only audio, or use Sandy/automatic
listening for word then sentence. Records can be marked mastered, tagged, removed,
backed up and synced with the existing learning account.

Only source dialogue ID, turn index, source character offsets and review metadata
are saved in the optional `shadowWords` state section. Correct words and sentences
are reconstructed from local course content. Neither recorded audio nor complete
recognized transcripts nor incorrect recognized spellings are saved or synced.
Older backups without this section still import; timestamped removal tombstones
prevent another device from restoring removed words. An original-sentence link
returns to its dialogue turn without needing microphone permission.

The server still binds only to `127.0.0.1`, checks exact Host and POST Origin,
has bounded audio sizes, and never serves model files, source, temporary recordings,
or private files. Audio exists in browser memory and a temporary local directory
which is deleted after success, cancellation or failure. Transcripts remain in page
memory, are not logged or synced to the learning account, and clear on reload or
account change. Starting playback, switching lines or leaving the page cancels
recognition. A permission prompt that resolves after cancellation immediately stops
its late microphone stream. Checking your turn preserves “我说完了”.
Optional iPad access adds only one validated, configured `.ts.net` HTTPS origin,
keeps CORS disabled, rejects cross-site requests and Tailscale Funnel headers,
and never exposes a directory, model, textbook, Git files or app source. No public
site posts audio across origins to the Mac. Open the private Mac page instead.

### Local installation and startup

One-time installation: run `setup_local_speech.py` with Python 3.12+. It installs
an isolated CMake runtime, builds a pinned CPU-only Whisper source release using
macOS Command Line Tools, and downloads the 181 MiB multilingual small-q5_1 model.
The lighter base model, if already installed, is a fallback when small is absent.
Source and model downloads are SHA-256 checked. No Homebrew or global packages
are changed. Everything is under git-ignored `.local-speech/`; do not upload this
directory. The supplied textbook PDF remains private too.

After installation, double-click **Start Sandy.command** or run
`.local-speech/venv/bin/python preview.py`. Keep that local server running while
practising; reopening the HTML directly does not start Whisper. Restarting the
server does not repeat the model download. Whisper recognition is available on
`http://127.0.0.1:8765` (or localhost), and optionally on the Mac's private HTTPS
page from an iPad through Tailscale. GitHub Pages cannot run the Whisper server.
The static website can be hosted independently and use iPad keyboard dictation.

### Use either mode on iPad

**iPad-only dictation:** open the hosted study page in Safari and select
**iPad / 系统听写**. Enable Dictation in Settings → General → Keyboard and add
a Japanese keyboard. Tap a line's **日语听写** button to open/focus its text box,
switch to Japanese, then tap the **keyboard's** microphone. The website cannot
start or stop Apple's system dictation for you and does not claim to do so.
Text input updates the same highlights; tap **比对文字** to finish, listen to
highlighted source words and star them as usual. Apple decides whether dictation
is processed on-device or by its services depending on your device/language/settings;
check Dictation & Privacy. The app makes no Whisper request in this mode.
[Apple's iPad dictation guide](https://support.apple.com/guide/ipad/dictate-text-ipad997d9642/ipados).

**iPad microphone + Mac Whisper:** install Tailscale on both devices and sign
in to the same private network. Use standalone Safari on iPad. On this Mac,
double-click **Start Sandy for iPad.command**. It checks the Mac's private
device name and existing Serve settings, then creates a private HTTPS proxy to
the loopback server. It never enables public Funnel or resets/overwrites another
app's port-443 routes. Allow Tailscale's HTTPS/Serve setup if asked.
It shows your private iPad URL and writes only that origin to the git-ignored
`.local-speech/ipad-access.json`; the updated server picks up this configuration
without a restart. If an older server occupies port 8765, the launcher asks you
to close its window first rather than killing it. Keep the Mac awake and Sandy
running. The iPad captures audio; the Mac performs Whisper inference.
[Tailscale Serve](https://tailscale.com/docs/features/tailscale-serve).

On a hosted page, **连接我的 Mac（可选）** can remember this validated private
root URL in the current browser. Its link opens the Mac's private conversation
page; saving an address never starts recording or sends an audio request. This
address and mode setting are not uploaded with learning data. Use the same Sandy
learning account on both origins to sync progress and saved words, or export/import
a backup; browser-local records are otherwise separate.

Both modes also allow pasted/typed Japanese and compare recognized text rather
than grading pronunciation. Embedded browsers must expose microphone capture
for Whisper; use Safari/Chrome if not. HTTPS/private certificates are required
on iPad; a plain `http://192.168…` address is not a secure microphone page.

Checks: `node tests/content-and-state.cjs`, `node tests/navigation.cjs`,
`node tests/shadowing.cjs`, `node tests/shadow-words.cjs`,
`node tests/recording-consent.cjs`, `node tests/dual-speech-mode.cjs` and
`python tests/local_speech_test.py` cover content, state, Japanese-only audio,
navigation destinations, resume selection, menu dismissal, prefix karaoke, PCM encoding, lifecycle, permission/error handling, silence,
cancellation, cleanup, dual-mode device preferences, no-recording dictation,
exact private origin checks, conflict/Funnel refusal and same-origin security.
Actual Japanese WAV inference can
also be tested through the local endpoint; human microphone capture/accuracy still
requires the user's permission and real reading.

Local integration check (2026-10-04): the public
[JSUT Japanese sample](https://huggingface.co/datasets/japanese-asr/ja_asr.jsut_basic5000/blob/main/sample.flac)
was converted to a 3.19-second PCM WAV and submitted to the actual local HTTP
endpoint, without supplying its reference text. Small-q5_1 returned
「水をマレーシアから買わなくてはならないのです」 in 2.9 seconds on this Mac.
This verifies audio inference and transport, not a human microphone or a general
accuracy benchmark. Browser inspection also confirmed the local-ready indicator.

The handwriting board follows the current item, supports pointer pressure for
Apple Pencil, can be collapsed, dragged and resized, and has a clear button.

## Add content

- Expressions: add an `e(...)` entry in `assets/data.js`; mark the answer with `{{…}}`.
- Words: add a row to the appropriate chapter in `assets/vocab.js`.
- Dialogues: add a `d(...)` entry in `assets/dialogues.js`.
- Two-choice questions: add a `t(...)` entry in `assets/traps.js`.

Keep IDs stable when updating content so existing learning records still resolve.
Shared presentation and behavior live in `assets/app.css` and `assets/app.js`.
