import React, { useState } from 'react';
import './App.css';

function App() {
  const [showForm, setShowForm] = useState(false);
  const [transactions, setTransactions] = useState([]);
  const [formData, setFormData] = useState({
    coin: '',
    symbol: '',
    quantity: '',
    pricePerCoin: '',
    date: '',
    type: 'buy'
  });

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData({
      ...formData,
      [name]: value
    });
  };

  const handleAddTransaction = (e) => {
    e.preventDefault();

    if (!formData.coin || !formData.quantity || !formData.pricePerCoin) {
      alert('Please fill all required fields');
      return;
    }

    const newTransaction = {
      id: Date.now(),
      coin: formData.coin,
      symbol: formData.symbol.toUpperCase(),
      quantity: parseFloat(formData.quantity),
      pricePerCoin: parseFloat(formData.pricePerCoin),
      totalInvested: parseFloat(formData.quantity) * parseFloat(formData.pricePerCoin),
      date: formData.date || new Date().toISOString().split('T')[0],
      type: formData.type
    };

    setTransactions([...transactions, newTransaction]);

    setFormData({
      coin: '',
      symbol: '',
      quantity: '',
      pricePerCoin: '',
      date: '',
      type: 'buy'
    });

    setShowForm(false);
  };

  const totalInvested = transactions.reduce((sum, t) => sum + t.totalInvested, 0);
  const totalQuantity = transactions.reduce((sum, t) => {
    return t.type === 'buy' ? sum + t.quantity : sum - t.quantity;
  }, 0);

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
            <p>₹{totalInvested.toFixed(2)}</p>
          </div>
          <div className="stat-card">
            <h3>Holdings</h3>
            <p>{totalQuantity.toFixed(4)} coins</p>
          </div>
          <div className="stat-card">
            <h3>Transactions</h3>
            <p>{transactions.length}</p>
          </div>
        </div>

        <button 
          className="btn-primary"
          onClick={() => setShowForm(!showForm)}
        >
          {showForm ? '✕ Close' : '+ Add Transaction'}
        </button>

        {showForm && (
          <form className="transaction-form" onSubmit={handleAddTransaction}>
            <h2>Add New Transaction</h2>

            <div className="form-group">
              <label>Coin Name *</label>
              <input
                type="text"
                name="coin"
                placeholder="e.g., Bitcoin"
                value={formData.coin}
                onChange={handleInputChange}
                required
              />
            </div>

            <div className="form-group">
              <label>Symbol *</label>
              <input
                type="text"
                name="symbol"
                placeholder="e.g., BTC"
                value={formData.symbol}
                onChange={handleInputChange}
                required
              />
            </div>

            <div className="form-row">
              <div className="form-group">
                <label>Quantity *</label>
                <input
                  type="number"
                  name="quantity"
                  placeholder="e.g., 0.5"
                  step="0.0001"
                  value={formData.quantity}
                  onChange={handleInputChange}
                  required
                />
              </div>

              <div className="form-group">
                <label>Price Per Coin (₹) *</label>
                <input
                  type="number"
                  name="pricePerCoin"
                  placeholder="e.g., 50000"
                  step="0.01"
                  value={formData.pricePerCoin}
                  onChange={handleInputChange}
                  required
                />
              </div>
            </div>

            <div className="form-row">
              <div className="form-group">
                <label>Date</label>
                <input
                  type="date"
                  name="date"
                  value={formData.date}
                  onChange={handleInputChange}
                />
              </div>

              <div className="form-group">
                <label>Type</label>
                <select
                  name="type"
                  value={formData.type}
                  onChange={handleInputChange}
                >
                  <option value="buy">Buy</option>
                  <option value="sell">Sell</option>
                </select>
              </div>
            </div>

            <div className="form-actions">
              <button type="submit" className="btn-success">Add Transaction</button>
              <button 
                type="button" 
                className="btn-cancel"
                onClick={() => setShowForm(false)}
              >
                Cancel
              </button>
            </div>
          </form>
        )}

        {transactions.length > 0 && (
          <div className="transactions-list">
            <h2>Your Transactions ({transactions.length})</h2>
            <div className="transactions-table">
              <div className="table-header">
                <div className="col-coin">Coin</div>
                <div className="col-qty">Quantity</div>
                <div className="col-price">Price/Coin</div>
                <div className="col-total">Total</div>
                <div className="col-date">Date</div>
                <div className="col-type">Type</div>
              </div>

              {transactions.map((tx) => (
                <div key={tx.id} className="table-row">
                  <div className="col-coin">
                    <strong>{tx.symbol}</strong>
                    <span>{tx.coin}</span>
                  </div>
                  <div className="col-qty">{tx.quantity}</div>
                  <div className="col-price">₹{tx.pricePerCoin.toFixed(2)}</div>
                  <div className="col-total">₹{tx.totalInvested.toFixed(2)}</div>
                  <div className="col-date">{tx.date}</div>
                  <div className={`col-type type-${tx.type}`}>{tx.type}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        {transactions.length === 0 && !showForm && (
          <div className="empty-state">
            <p>No transactions yet. Click "Add Transaction" to get started!</p>
          </div>
        )}
      </div>
    </div>
  );
}

export default App;