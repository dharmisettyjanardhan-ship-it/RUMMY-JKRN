# 101 & 201 POOL RUMMY

## COMPLETE GAME REQUIREMENTS & LOGIC DOCUMENT

### 1. GAME MODES

The application shall support two Pool Rummy modes:

* 101 Pool Rummy
* 201 Pool Rummy

### 2. BASIC DIFFERENCE

| Feature           |                                      101 Pool |                                      201 Pool |
| ----------------- | --------------------------------------------: | --------------------------------------------: |
| Elimination Limit |                                    101 Points |                                    201 Points |
| First Drop        |                                    20 Points* |                                    25 Points* |
| Middle Drop       |                                    40 Points* |                                    50 Points* |
| Objective         | Remain until all other players are eliminated | Remain until all other players are eliminated |

*Drop values must be configurable in the game settings.

---

# 3. GAME LOBBY

Before starting a game, display:

* Game Type: 101 / 201
* Number of Players
* Entry/Room information
* Player names
* Player profile/photo
* Ready status
* Start Game button

Example:

PLAYER 1 – READY
PLAYER 2 – READY
PLAYER 3 – READY
PLAYER 4 – READY

START GAME

---

# 4. TOSS SYSTEM

The game shall perform a random toss before the first round.

### Toss Flow

TOSS START
↓
Random Head/Tail Result
↓
Assign Result to Players
↓
Select Toss Winner
↓
Display Toss Winner
↓
Toss Winner Gets First Turn

Example:

TOSS RESULT

Player 1 – HEAD
Player 2 – TAIL
Player 3 – HEAD
Player 4 – TAIL

TOSS WINNER: PLAYER 1

PLAYER 1 STARTS

The randomization must be server-side in multiplayer mode to prevent manipulation.

---

# 5. CARD DECK

The game shall use standard Rummy cards according to the selected table configuration.

Required card elements:

* Clubs
* Diamonds
* Hearts
* Spades
* Number cards
* A, J, Q, K
* Printed Joker
* Wild Joker

The exact number of decks shall be configurable according to the table/player configuration.

---

# 6. JOKER SELECTION

At the beginning of each round:

1. Shuffle the deck.
2. Select the Wild Joker randomly.
3. Display the Joker clearly.
4. Mark all cards of that rank as Wild Jokers.
5. Printed Joker shall be separately identified.

Example:

WILD JOKER = 8♥

Then 8♠, 8♥, 8♦ and 8♣ can function as Wild Jokers according to the selected rules.

PRINTED JOKER must also be visually identifiable.

---

# 7. DEALING 13 CARDS

Each active player shall receive 13 cards.

Example:

Player 1 → 13 Cards
Player 2 → 13 Cards
Player 3 → 13 Cards
Player 4 → 13 Cards

Cards shall be dealt automatically.

The dealing animation should show cards moving from the deck to each player's hand.

---

# 8. TABLE DESIGN

The table shall contain:

### Center Area

* Closed Deck
* Open/Discard Deck
* Wild Joker display
* Round number
* Current turn indicator

### Player Area

Each player shall display:

* Player name
* Profile image
* Current score
* Total score
* Cards remaining
* Turn indicator
* Drop status
* Connection status

---

# 9. CLOSED DECK

The closed deck shall appear face-down.

Example:

CLOSED DECK
[ 🂠 ]

When the player clicks/touches the Closed Deck:

→ One card is drawn.

The card shall be added to the player's hand.

---

# 10. OPEN / DISCARD DECK

The discard pile shall display the latest discarded card.

Example:

OPEN DECK
[ 7♥ ]

Player can select the top available discard card according to the game's pickup rules.

After taking a card, the player must discard one card.

---

# 11. PLAYER TURN

Every turn shall follow this sequence:

START TURN
↓
30 SECOND TIMER
↓
DRAW CARD
↓
CARD ADDED TO HAND
↓
ARRANGE / SELECT CARDS
↓
DISCARD ONE CARD
↓
TURN ENDS
↓
NEXT PLAYER

Only the active player can perform Draw/Discard actions.

---

# 12. 30-SECOND TIMER

Each player turn shall have a 30-second countdown.

Display:

30
29
28
27
...
05
04
03
02
01

When timer reaches zero:

TIME OUT

The application shall execute the predefined timeout rule.

Timeout behaviour must be configurable by the game administrator.

---

# 13. DRAW CARD

The Draw button shall be enabled only during the player's turn.

DRAW CARD

After drawing:

* Add card to hand.
* Disable further draw action for that turn.
* Enable discard action.

The drawn card should be visually highlighted.

---

# 14. DRAWN CARD TOUCH / CLICK

After a player draws a card:

1. The drawn card shall be highlighted.
2. Player can click/touch the card.
3. A Discard popup shall appear.

Example:

CARD SELECTED

[ DISCARD ]

[ CANCEL ]

If the player selects DISCARD:

→ Card moves to Open/Discard Deck.

If CANCEL:

→ Return to player's hand.

This feature must work for both mouse click and mobile touch.

---

# 15. DISCARD

A player must discard one card before the turn ends.

Discard flow:

SELECT CARD
↓
DISCARD POPUP
↓
CONFIRM DISCARD
↓
CARD MOVES TO OPEN DECK
↓
TURN COMPLETE
↓
NEXT PLAYER

The application must prevent a player from discarding another player's card.

---

# 16. RUMMY GROUPS

Cards can be arranged into:

### PURE SEQUENCE

Example:

4♥ – 5♥ – 6♥

No Joker required.

### IMPURE SEQUENCE

Example:

4♥ – 5♥ – Wild Joker

Joker substitutes for the missing card according to the game rules.

### SET

Example:

7♥ – 7♣ – 7♦

A valid declaration must satisfy the configured Rummy validation rules.

---

# 17. VALID DECLARATION

The standard validation requirement should be:

* 13 cards must be arranged into valid groups.
* At least 2 sequences are required.
* At least 1 sequence must be a Pure Sequence.
* Remaining cards must form valid sequences/sets.

When player presses:

DECLARE

the system must automatically validate all 13 cards.

---

# 18. INVALID DECLARATION

If the cards are invalid:

INVALID DECLARATION

The player remains in the round.

The system must display an appropriate error message.

Example:

"Invalid Declaration. At least one Pure Sequence is required."

---

# 19. VALID DECLARATION

If the cards are valid:

VALID DECLARATION

ROUND COMPLETED

The declaring player receives the appropriate round score according to the configured scoring rules, normally 0 points.

---

# 20. DROP SYSTEM

The application shall provide a DROP button.

Drop rules must distinguish:

### FIRST DROP

Player drops before completing meaningful play in the round.

101 Pool → normally 20 points
201 Pool → normally 25 points

### MIDDLE DROP

Player drops after participating in the round.

101 Pool → normally 40 points
201 Pool → normally 50 points

Drop values must be configurable.

---

# 21. ROUND SCORING

At the end of every round:

1. Identify the winner/declarer.
2. Validate all remaining players.
3. Calculate each player's card points.
4. Apply maximum penalty if configured.
5. Add round score to total score.
6. Check elimination threshold.

Example:

Player 1:

Previous Total = 45
Round Score = 20
New Total = 65

Player 2:

Previous Total = 85
Round Score = 25
New Total = 110

In 101 Pool:

Player 2 → ELIMINATED

---

# 22. CARD POINT VALUES

Default scoring configuration:

Number cards:

2 → 2 points
3 → 3 points
4 → 4 points
5 → 5 points
6 → 6 points
7 → 7 points
8 → 8 points
9 → 9 points
10 → 10 points

Face cards:

J → 10 points
Q → 10 points
K → 10 points
A → 10 points

Jokers:

Wild Joker → 0 points
Printed Joker → 0 points

The exact Ace/Joker rules must remain configurable.

---

# 23. MAXIMUM PENALTY

The game shall support a configurable maximum penalty per round.

Example configuration:

MAX ROUND PENALTY = 80

If a player's calculated penalty exceeds the configured maximum:

Final Round Score = Maximum Penalty

Example:

Calculated = 96
Maximum = 80

Final Score = 80

---

# 24. TOTAL SCORE

The player's score shall accumulate across rounds.

Example:

ROUND 1 = 20
ROUND 2 = 15
ROUND 3 = 30

TOTAL = 65

The scoreboard must update immediately after each completed round.

---

# 25. 101 ELIMINATION

For 101 Pool:

If:

TOTAL SCORE >= 101

then:

PLAYER ELIMINATED

Example:

Current Score = 100
Round Score = 5

New Score = 105

105 >= 101

PLAYER OUT

---

# 26. 201 ELIMINATION

For 201 Pool:

If:

TOTAL SCORE >= 201

then:

PLAYER ELIMINATED

Example:

Current Score = 190
Round Score = 15

New Score = 205

205 >= 201

PLAYER OUT

---

# 27. ELIMINATED PLAYER

After elimination:

* Player status changes to ELIMINATED.
* Player cannot participate in future rounds.
* Player cards are removed from active gameplay.
* Player remains visible in scoreboard.
* Display total score.
* Display elimination status.

Example:

PLAYER 3
TOTAL: 105
STATUS: ELIMINATED

---

# 28. NEXT ROUND

After scoring:

ROUND COMPLETE
↓
UPDATE SCOREBOARD
↓
ELIMINATION CHECK
↓
REMOVE ELIMINATED PLAYERS
↓
CHECK ACTIVE PLAYERS
↓
IF MORE THAN ONE PLAYER
↓
START NEXT ROUND

---

# 29. NEW ROUND

For every new round:

1. Reset cards.
2. Create/shuffle deck.
3. Select new Joker.
4. Deal 13 cards.
5. Determine first player.
6. Start timer.
7. Begin gameplay.

Each new round must use a fresh randomized card sequence.

---

# 30. TURN ORDER

Turn order should follow the table seating order.

Example:

P1 → P2 → P3 → P4 → P1

If P2 is eliminated:

P1 → P3 → P4 → P1

Eliminated players must be skipped automatically.

---

# 31. SCOREBOARD

Display:

| Player   | Round Score | Total Score | Status     |
| -------- | ----------: | ----------: | ---------- |
| Player 1 |          10 |          45 | Playing    |
| Player 2 |          25 |         105 | Eliminated |
| Player 3 |           0 |          60 | Playing    |
| Player 4 |          20 |          80 | Playing    |

The scoreboard shall update after every round.

---

# 32. WINNER LOGIC

After every elimination check:

IF ACTIVE PLAYERS > 1
→ Continue Game

IF ACTIVE PLAYERS = 1
→ End Game

The final active player is declared the winner.

Display:

🏆 GAME OVER

WINNER
PLAYER NAME

FINAL SCORE
XX POINTS

---

# 33. COMPLETE GAME FLOW

LOBBY
↓
SELECT 101 / 201
↓
PLAYERS JOIN
↓
READY
↓
TOSS
↓
TOSS WINNER
↓
SHUFFLE
↓
JOKER SELECTION
↓
DEAL 13 CARDS
↓
ROUND START
↓
30 SECOND TIMER
↓
DRAW
↓
ARRANGE CARDS
↓
DISCARD
↓
NEXT PLAYER
↓
DRAW
↓
DISCARD
↓
DECLARE / DROP / CONTINUE
↓
ROUND END
↓
VALIDATE
↓
CALCULATE SCORE
↓
UPDATE TOTAL SCORE
↓
ELIMINATION CHECK
↓
NEXT ROUND
↓
REPEAT
↓
ONE ACTIVE PLAYER
↓
WINNER
↓
GAME OVER

---

# 34. IMPORTANT ANTI-CHEAT REQUIREMENTS

For a multiplayer application:

* Card shuffle must be server controlled.
* Random numbers must not be generated only in the browser.
* Other players' cards must never be sent to the client.
* Toss result must be server generated.
* Joker selection must be server generated.
* Player score must be validated server-side.
* Declare validation must be server-side.
* A player must not be able to draw twice.
* A player must not be able to discard twice.
* A player must not play after timeout.
* A player must not play after elimination.
* Turn ownership must be server validated.

---

# 35. MOBILE SUPPORT

The complete game must support:

* Desktop
* Android
* Mobile browser
* Touch screens

Buttons must be touch-friendly.

Required buttons:

DRAW
DISCARD
DROP
DECLARE
SORT
GROUP
CLOSE

Cards must support:

* Click
* Touch
* Drag
* Select
* Move

---

# 36. UI STATUS INDICATORS

During gameplay display:

CURRENT TURN: PLAYER 2

TIME LEFT: 24 SEC

JOKER: 8♥

ROUND: 4

YOUR SCORE: 65

TOTAL PLAYERS: 5

ACTIVE PLAYERS: 4

---

# 37. REQUIRED GAME STATES

The application should support these states:

LOBBY
TOSS
DEALING
ROUND_START
PLAYER_TURN
DRAW
CARD_SELECTED
DISCARD
DROP
DECLARE
VALIDATION
ROUND_END
SCORING
ELIMINATION
NEXT_ROUND
GAME_OVER

---

# 38. FINAL DEVELOPER REQUIREMENT

The developer must implement **101 Pool Rummy and 201 Pool Rummy as configurable game modes**, rather than creating two completely separate games.

The following values should be configurable:

* Pool limit
* First Drop score
* Middle Drop score
* Maximum penalty
* Number of players
* Number of decks
* Turn timer
* Joker rules
* Ace rules
* Timeout rules
* Re-entry rules, if enabled

This allows the same game engine to run both:

**101 POOL RUMMY**

and

**201 POOL RUMMY**

with different configuration values.
