# Gameplay

The rules are carried over from the 1997 TI-83 program (`INSANE.z80`). The engine is
`src/model/engine.ts`, a line-for-line port of `GameEngine.swift` from the iOS app.

## The board

- 12 columns × 8 rows, five tile kinds: triangle (amber), cross (coral), square (mint),
  circle (violet), diamond (sky). Each kind has its own shape as well as color.
- Clear any group of **two or more** orthogonally touching tiles of the same kind.
- After a clear, tiles **fall** straight down, then any **empty column is removed** and the columns to
  its right slide left. New groups often form this way.

## Scoring

Each clear scores **(tiles − 1)²**:

| Tiles | 2 | 3 | 4 | 5 | 10 | 11 | 20 |
|---|---|---|---|---|---|---|---|
| Points | 1 | 4 | 9 | 16 | 81 | 100 | 361 |

Emptying the entire board in Puzzle or Daily **multiplies the final score by 4**. Big groups usually
beat a clean board, as the original readme warned.

## Modes

| Mode | Start | Ends when | Notes |
|---|---|---|---|
| **Puzzle** | Full board, random | No touching pairs remain | The original SameGame |
| **Action** | Bottom half filled | The board overflows | You can't win, only last |
| **Daily** | Full board, seeded by date | No touching pairs remain | Same board for everyone, iOS included; new at local midnight |

### Action Mode timing

Taken from the calculator's counter logic (`CounterAdd` / `ShoveIt`):

- A counter rises by **31.25 units per second**. When it reaches the delay (starts at **75**, so
  2.4 s), a tile drops into the first empty cell, scanning the bottom row left to right, then each row
  above.
- Every **6** new tiles, the delay drops by 1 (minimum 2), so the level goes up.
- Every touch adds **10** units and every clear **5** more, so acting fast brings the next tile sooner.
  Hold still while you think.
- A faint ghost of the next tile grows in its slot, and the board edge pulses red once it's about
  three-quarters full.

Constants live at the top of `GameEngine` in `src/model/engine.ts`.

## Daily Puzzle

- Puzzle #1 was 1 January 2026; the number rises by one each local calendar day.
- Your best score for each day is kept. Playing on consecutive days builds a **streak**; the streak
  stays alive until the end of the day after your last play.
- Replays are allowed and count toward the day's best.

## Achievements

| Achievement | How to earn it |
|---|---|
| First Pop | Clear your first group |
| Big Twenty | Clear 20 or more tiles at once |
| Clean Sweep | Empty an entire board |
| Five Hundred Club | Score 500 in one Puzzle or Daily game |
| Survivor | Last three minutes in Action Mode |
| Speed Demon | Reach speed level 10 in Action Mode |
| Daily Habit | Play the Daily Puzzle three days running |
| Old School | Finish a game on the classic TI-83 screen |

## Controls

| Input | Action |
|---|---|
| Touch, Puzzle/Daily | Tap a group to see its points, tap it again to clear. Turn off *Tap twice to clear* in Settings for one-tap clears. |
| Touch, Action | One tap clears. |
| Touch, any mode | Press and hold to preview; slide off the board before lifting to cancel. |
| Mouse | Hover to preview, click to clear. |
| Keyboard | Arrows move the cursor, Space/Enter clears, **P** or **Esc** pauses, **M** mutes, **L** toggles the classic screen. On the title screen, arrows pick a mode and Enter plays. |

Pausing hides the board, as the calculator did, so a pause can't be used to plan. The game also
pauses itself when you switch away from the tab or app.
