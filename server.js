<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>201 Pool Rummy Game</title>
    <style>
        body {
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
            background: linear-gradient(135deg, #0f9b0f, #000000);
            color: #fff;
            margin: 0;
            padding: 20px;
            display: flex;
            flex-direction: column;
            align-items: center;
            min-height: 100vh;
        }
        h1 {
            margin-bottom: 5px;
            text-shadow: 2px 2px 4px rgba(0,0,0,0.5);
        }
        .subtitle {
            font-size: 14px;
            color: #ddd;
            margin-bottom: 20px;
        }
        .container {
            background: rgba(0, 0, 0, 0.75);
            padding: 25px;
            border-radius: 15px;
            box-shadow: 0 8px 16px rgba(0,0,0,0.6);
            width: 100%;
            max-width: 500px;
            text-align: center;
        }
        .scoreboard {
            display: flex;
            justify-content: space-around;
            margin-bottom: 20px;
            background: #222;
            padding: 12px;
            border-radius: 8px;
        }
        .player-score {
            font-size: 16px;
        }
        .player-score span {
            font-weight: bold;
            color: #ffcc00;
        }
        .game-area {
            margin: 20px 0;
            background: #111;
            padding: 15px;
            border-radius: 8px;
            border: 1px dashed #555;
        }
        .card {
            display: inline-block;
            background: #fff;
            color: #000;
            width: 50px;
            height: 75px;
            margin: 5px;
            border-radius: 5px;
            line-height: 75px;
            font-weight: bold;
            font-size: 16px;
            box-shadow: 0 4px 8px rgba(0,0,0,0.3);
        }
        .controls input {
            padding: 10px;
            font-size: 16px;
            width: 80px;
            text-align: center;
            border-radius: 5px;
            border: none;
            margin-right: 10px;
        }
        button {
            padding: 10px 20px;
            font-size: 16px;
            background-color: #ff9800;
            color: white;
            border: none;
            border-radius: 5px;
            cursor: pointer;
            font-weight: bold;
            transition: 0.2s;
        }
        button:hover {
            background-color: #e68900;
        }
        .status-msg {
            margin-top: 15px;
            font-size: 15px;
            color: #ffeb3b;
        }
        .rules {
            font-size: 12px;
            color: #bbb;
            margin-top: 20px;
            text-align: left;
            background: rgba(255,255,255,0.05);
            padding: 10px;
            border-radius: 5px;
        }
    </style>
</head>
<body>

    <h1>201 Pool Rummy</h1>
    <div class="subtitle">Classic Indian Rummy Scorekeeper & Simulation</div>

    <div class="container">
        <div class="scoreboard">
            <div class="player-score">Player 1: <span id="score1">0</span> / 201</div>
            <div class="player-score">Player 2: <span id="score2">0</span> / 201</div>
        </div>

        <div id="turnInfo" style="font-weight: bold; color: #4CAF50; margin-bottom: 10px;">Player 1 Turn</div>

        <div class="game-area">
            <p>Your Hand Cards:</p>
            <div id="handCards"></div>
        </div>

        <div class="controls" id="controlPanel">
            <label for="penaltyInput">Enter Points (0 for Drop/Win):</label><br><br>
            <input type="number" id="penaltyInput" min="0" max="80" value="0">
            <button onclick="submitScore()">Submit Round</button>
        </div>

        <div class="status-msg" id="statusMsg"></div>
        <button id="restartBtn" onclick="resetGame()" style="display:none; margin-top:15px; background-color: #4CAF50;">Play Again</button>
    </div>

    <div class="container" style="margin-top: 20px; max-width: 500px;">
        <div class="rules">
            <strong>201 Pool Rules:</strong>
            <ul>
                <li>Players get points based on unarranged cards when opponent declares.</li>
                <li>Middle Drop = 20 points, First Drop = 40 points, Full Count = 80 max points.</li>
                <li>First player to cross **201 points** gets **Eliminated** (Lost the game).</li>
            </ul>
        </div>
    </div>

    <script>
        let score1 = 0;
        let score2 = 0;
        let currentTurn = 1; // 1 for Player 1, 2 for Player 2
        let gameOver = false;

        const suits = ['♠', '♥', '♦', '♣'];
        const values = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];

        function generateHand() {
            let handHTML = '';
            for(let i=0; i<5; i++) {
                let randomSuit = suits[Math.floor(Math.random() * suits.length)];
                let randomVal = values[Math.floor(Math.random() * values.length)];
                let color = (randomSuit === '♥' || randomSuit === '♦') ? 'color: red;' : 'color: black;';
                handHTML += `<div class="card" style="${color}">${randomVal}${randomSuit}</div>`;
            }
            document.getElementById('handCards').innerHTML = handHTML;
        }

        function submitScore() {
            if(gameOver) return;

            let points = parseInt(document.getElementById('penaltyInput').value);
            if(isNaN(points) || points < 0 || points > 80) {
                alert("Daya chesi 0 nundi 80 madhya lo matrame points enter cheyandi (Max limit per deal is 80).");
                return;
            }

            if(currentTurn === 1) {
                score1 += points;
                document.getElementById('score1').innerText = score1;
            } else {
                score2 += points;
                document.getElementById('score2').innerText = score2;
            }

            // Check for 201 Elimination
            if(score1 >= 201 || score2 >= 201) {
                gameOver = true;
                let loser = score1 >= 201 ? "Player 1" : "Player 2";
                let winner = score1 >= 201 ? "Player 2" : "Player 1";
                document.getElementById('statusMsg').innerText = `Game Over! ${loser} crossed 201 points and is Eliminated. ${winner} Wins!`;
                document.getElementById('controlPanel').style.display = 'none';
                document.getElementById('restartBtn').style.display = 'inline-block';
                document.getElementById('turnInfo').innerText = "Match Finished";
                return;
            }

            // Switch Turn
            currentTurn = currentTurn === 1 ? 2 : 1;
            document.getElementById('turnInfo').innerText = `Player ${currentTurn} Turn`;
            document.getElementById('penaltyInput').value = 0;
            generateHand();
        }

        function resetGame() {
            score1 = 0;
            score2 = 0;
            currentTurn = 1;
            gameOver = false;
            document.getElementById('score1').innerText = score1;
            document.getElementById('score2').innerText = score2;
            document.getElementById('statusMsg').innerText = '';
            document.getElementById('controlPanel').style.display = 'block';
            document.getElementById('restartBtn').style.display = 'none';
            document.getElementById('turnInfo').innerText = "Player 1 Turn";
            generateHand();
        }

        // Initialize first hand
        generateHand();
    </script>
</body>
</html>
