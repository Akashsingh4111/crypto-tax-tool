import React, { useState } from 'react';
import './App.css';

function App() {
  const [portfolio] = useState({
    totalInvested: 0,
    currentValue: 0,
    coins: []
  });

  return (
    <div className="App">
      <header className="App-header">
        <h1>💰 Crypto Tax Tool</h1>
        <p>Track your crypto portfolio and calculate taxes</p>
      </header>

      <div className="container">
        <div className="stats">
          <div className="stat-card">
            <h3>Total Invested</h3>
            <p>₹{portfolio.totalInvested}</p>
          </div>
          <div className="stat-card">
            <h3>Current Value</h3>
            <p>₹{portfolio.currentValue}</p>
          </div>
          <div className="stat-card">
            <h3>Gain/Loss</h3>
            <p>₹{portfolio.currentValue - portfolio.totalInvested}</p>
          </div>
        </div>

        <button className="btn-primary">
          + Add Transaction
        </button>
      </div>
    </div>
  );
}

export default App;