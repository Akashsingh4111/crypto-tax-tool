import { useEffect, useState } from 'react';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import { auth } from './firebase';
import { collection, addDoc, getDocs, deleteDoc, doc, updateDoc, query, where } from 'firebase/firestore';
import { db } from './firebase';
import { BrowserRouter as Router, Routes, Route, Link } from 'react-router-dom';
import SignUp from './pages/SignUp';
import Login from './pages/Login';
import './App.css';
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';

// ==================== FIRESTORE FUNCTIONS ====================

// SAVE TRANSACTION TO FIRESTORE
async function saveTransactionToFirestore(transaction, userId) {
  try {
    const docRef = await addDoc(collection(db, 'transactions'), {
      coin: transaction.coin,
      symbol: transaction.symbol,
      quantity: transaction.quantity,
      pricePerCoin: transaction.pricePerCoin,
      totalInvested: transaction.totalInvested,
      date: transaction.date,
      type: transaction.type,
      userId: userId,
      createdAt: new Date().toISOString()
    });
    console.log('✅ Saved to Firestore:', docRef.id);
    return docRef.id;
  } catch (error) {
    console.error('❌ Error saving:', error);
    throw error;
  }
}

// LOAD TRANSACTIONS FROM FIRESTORE
async function loadTransactionsFromFirestore(userId) {
  try {
    const q = query(collection(db, 'transactions'), where('userId', '==', userId));
    const querySnapshot = await getDocs(q);
    const transactions = [];
    querySnapshot.forEach((docSnap) => {
      transactions.push({
        id: docSnap.id,
        ...docSnap.data()
      });
    });
    console.log('✅ Loaded from Firestore:', transactions.length, 'transactions');
    return transactions;
  } catch (error) {
    console.error('❌ Error loading:', error);
    return [];
  }
}

// DELETE TRANSACTION FROM FIRESTORE
async function deleteTransactionFromFirestore(docId) {
  try {
    await deleteDoc(doc(db, 'transactions', docId));
    console.log('✅ Deleted from Firestore:', docId);
  } catch (error) {
    console.error('❌ Error deleting:', error);
    throw error;
  }
}

// UPDATE TRANSACTION IN FIRESTORE
async function updateTransactionInFirestore(docId, updatedData) {
  try {
    const docRef = doc(db, 'transactions', docId);
    await updateDoc(docRef, {
      coin: updatedData.coin,
      symbol: updatedData.symbol,
      quantity: updatedData.quantity,
      pricePerCoin: updatedData.pricePerCoin,
      totalInvested: updatedData.totalInvested,
      date: updatedData.date,
      type: updatedData.type
    });
    console.log('✅ Updated in Firestore:', docId);
  } catch (error) {
    console.error('❌ Error updating:', error);
    throw error;
  }
}

// ==================== IMPROVED TAX CALCULATOR ====================
function calculateIndianTax(transactions, totalInvested, currentValue, prices) {
  let shortTermGain = 0;
  let longTermGain = 0;
  let shortTermTax = 0;
  let longTermTax = 0;

  const buyTransactions = transactions.filter(t => t.type === 'buy');
  const sellTransactions = transactions.filter(t => t.type === 'sell');
  
  sellTransactions.forEach(sellTx => {
    const matchingBuys = buyTransactions
      .filter(t => t.symbol === sellTx.symbol && new Date(t.date) < new Date(sellTx.date))
      .sort((a, b) => new Date(a.date) - new Date(b.date));
    
    if (matchingBuys.length > 0) {
      const buyTx = matchingBuys[0];
      const buyDate = new Date(buyTx.date);
      const sellDate = new Date(sellTx.date);
      const holdingPeriodDays = (sellDate - buyDate) / (1000 * 60 * 60 * 24);
      const holdingPeriodYears = holdingPeriodDays / 365;
      
      const costBasis = buyTx.pricePerCoin;
      const salePrice = sellTx.pricePerCoin;
      const gain = (salePrice - costBasis) * sellTx.quantity;
      
      if (gain > 0) {
        if (holdingPeriodYears < 2) {
          shortTermGain += gain;
          shortTermTax += gain * 0.30;
        } else {
          longTermGain += gain;
          longTermTax += gain * 0.20;
        }
      }
    }
  });

  const unrealizedGain = currentValue - totalInvested;
  const totalRealizedGain = shortTermGain + longTermGain;
  let totalTax = shortTermTax + longTermTax;

  const mustReportInReturn = totalRealizedGain > 0;
  if (totalRealizedGain < 250000 && totalRealizedGain > 0) {
    totalTax = 0;
  }

  const totalLoss = sellTransactions
    .filter(tx => {
      const buyTx = buyTransactions.find(b => b.symbol === tx.symbol && new Date(b.date) < new Date(tx.date));
      return buyTx && (tx.pricePerCoin - buyTx.pricePerCoin) * tx.quantity < 0;
    })
    .reduce((sum, tx) => {
      const buyTx = buyTransactions.find(b => b.symbol === tx.symbol && new Date(b.date) < new Date(tx.date));
      return sum + Math.min(0, (tx.pricePerCoin - buyTx.pricePerCoin) * tx.quantity);
    }, 0);

  return {
    shortTermGain: Math.max(0, shortTermGain),
    longTermGain: Math.max(0, longTermGain),
    shortTermTax: shortTermTax,
    longTermTax: longTermTax,
    totalRealizedGain: totalRealizedGain,
    totalTax: totalTax,
    unrealizedGain: unrealizedGain,
    totalLoss: Math.abs(totalLoss),
    mustReportInReturn: mustReportInReturn,
    noTDSReason: totalRealizedGain > 0 && totalRealizedGain < 250000 ? 'Below ₹2,50,000 threshold' : null
  };
}

function calculateROI(invested, currentValue) {
  if (invested === 0) return 0;
  return ((currentValue - invested) / invested) * 100;
}

function calculateCostBasis(buyTransactions) {
  if (buyTransactions.length === 0) return 0;
  const totalCost = buyTransactions.reduce((sum, t) => sum + t.totalInvested, 0);
  const totalQuantity = buyTransactions.reduce((sum, t) => sum + t.quantity, 0);
  return totalQuantity > 0 ? totalCost / totalQuantity : 0;
}

// ==================== COMPONENTS ====================

function Toast({ message, type = 'success' }) {
  return <div className={`toast toast-${type}`}>{message}</div>;
}

// ==================== HOME PAGE ====================
function Home({ transactions, totalInvested, totalQuantity, historicalData, coinData, darkMode, prices, taxInfo, user }) {
  const currentValue = Object.values(coinData).reduce((sum, coin) => {
    const price = prices[coin.name] || 0;
    return sum + (coin.quantity * price);
  }, 0);
  
  const gainLoss = currentValue - totalInvested;
  const gainLossPercent = totalInvested > 0 ? ((gainLoss / totalInvested) * 100) : 0;
  const roi = calculateROI(totalInvested, currentValue);

  const chartData = Object.values(coinData)
    .filter(c => c.quantity > 0)
    .map(coin => ({
      ...coin,
      currentValue: coin.quantity * (prices[coin.name] || 0),
      gain: (coin.quantity * (prices[coin.name] || 0)) - coin.value
    }));

  return (
    <div className="page">
      <h1 className="animate-fade-in">💰 Dashboard</h1>
      
      <div className="stats">
        <div className="stat-card animate-slide-up" style={{ animationDelay: '0s' }}>
          <h3>💵 Total Invested</h3>
          <p>₹{totalInvested.toFixed(2)}</p>
          <span className="stat-subtext">{transactions.filter(t => t.type === 'buy').length} buys</span>
        </div>
        <div className="stat-card animate-slide-up" style={{ animationDelay: '0.1s' }}>
          <h3>📊 Current Value</h3>
          <p>₹{currentValue.toFixed(2)}</p>
          <span className="stat-subtext">Live prices</span>
        </div>
        <div className="stat-card animate-slide-up" style={{ animationDelay: '0.2s' }}>
          <h3>📈 Gain/Loss</h3>
          <p className={gainLoss >= 0 ? 'text-green' : 'text-red'}>₹{Math.abs(gainLoss).toFixed(2)}</p>
          <span className="stat-subtext">{gainLossPercent > 0 ? '+' : ''}{gainLossPercent.toFixed(2)}%</span>
        </div>
        <div className="stat-card animate-slide-up" style={{ animationDelay: '0.3s' }}>
          <h3>🎯 ROI</h3>
          <p className={roi >= 0 ? 'text-green' : 'text-red'}>{roi.toFixed(2)}%</p>
          <span className="stat-subtext">Return on investment</span>
        </div>
        <div className="stat-card animate-slide-up" style={{ animationDelay: '0.4s' }}>
          <h3>💳 Tax Liability</h3>
          <p>₹{taxInfo.totalTax.toFixed(2)}</p>
          <span className="stat-subtext">Calculated as per India rules</span>
        </div>
        <div className="stat-card animate-slide-up" style={{ animationDelay: '0.5s' }}>
          <h3>💎 Holdings</h3>
          <p>{Object.keys(coinData).length}</p>
          <span className="stat-subtext">Unique coins</span>
        </div>
      </div>

      {historicalData.length > 0 && (
        <div className="charts-wrapper animate-fade-in" style={{ animationDelay: '0.6s' }}>
          <div className="chart-container">
            <h2>📈 Investment Growth</h2>
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={historicalData}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.1)" />
                <XAxis dataKey="date" stroke="rgba(255,255,255,0.7)" style={{ fontSize: '12px' }} />
                <YAxis stroke="rgba(255,255,255,0.7)" style={{ fontSize: '12px' }} />
                <Tooltip formatter={(value) => `₹${(value).toFixed(2)}`} contentStyle={{ backgroundColor: 'rgba(0,0,0,0.5)', border: '1px solid rgba(255,255,255,0.3)', borderRadius: '8px' }} />
                <Line type="monotone" dataKey="invested" stroke="#10b981" dot={{ fill: '#10b981', r: 4 }} activeDot={{ r: 6 }} strokeWidth={2} />
              </LineChart>
            </ResponsiveContainer>
          </div>

          {chartData.length > 0 && (
            <div className="chart-container">
              <h2>💵 Invested vs Current Value</h2>
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.1)" />
                  <XAxis dataKey="name" stroke="rgba(255,255,255,0.7)" style={{ fontSize: '12px' }} />
                  <YAxis stroke="rgba(255,255,255,0.7)" style={{ fontSize: '12px' }} />
                  <Tooltip formatter={(value) => `₹${(value).toFixed(2)}`} />
                  <Legend />
                  <Bar dataKey="value" fill="#667eea" name="Invested" />
                  <Bar dataKey="currentValue" fill="#10b981" name="Current Value" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      )}

      {chartData.length > 0 && (
        <div className="coin-breakdown animate-fade-in" style={{ animationDelay: '0.7s' }}>
          <h2>🪙 Portfolio (Live Prices)</h2>
          <div className="breakdown-table">
            <div className="breakdown-header">
              <div className="col-name">Coin</div>
              <div className="col-qty">Qty</div>
              <div className="col-price">Price</div>
              <div className="col-invested">Invested</div>
              <div className="col-value">Value</div>
              <div className="col-gain">Gain/Loss</div>
            </div>
            {chartData.map((coin) => (
              <div key={coin.name} className="breakdown-row">
                <div className="col-name"><strong>{coin.name}</strong><span>{coin.coin}</span></div>
                <div className="col-qty">{coin.quantity.toFixed(4)}</div>
                <div className="col-price">₹{(prices[coin.name] || 0).toFixed(2)}</div>
                <div className="col-invested">₹{coin.value.toFixed(2)}</div>
                <div className="col-value">₹{coin.currentValue.toFixed(2)}</div>
                <div className={`col-gain ${coin.gain >= 0 ? 'text-green' : 'text-red'}`}>
                  {coin.gain >= 0 ? '+' : ''}₹{coin.gain.toFixed(2)}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {transactions.length === 0 && (
        <div className="empty-state">
          {user ? (
            <p>No transactions yet. Go to <Link to="/transactions">Transactions</Link> to add one!</p>
          ) : (
            <p>Please <Link to="/login">login</Link> to start tracking your crypto investments!</p>
          )}
        </div>
      )}
    </div>
  );
}

// ==================== TRANSACTIONS PAGE ====================
function Transactions({ transactions, setTransactions, showForm, setShowForm, formData, setFormData, darkMode, toast, setToast, user }) {
  const [searchTerm, setSearchTerm] = useState('');
  const [filterType, setFilterType] = useState('all');
  const [editingId, setEditingId] = useState(null);
  const [loading, setLoading] = useState(false);

  if (!user) {
    return (
      <div className="page">
        <h1>📋 Transactions</h1>
        <div className="empty-state">
          <p>Please <Link to="/login">login</Link> to view transactions.</p>
        </div>
      </div>
    );
  }

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData({ ...formData, [name]: value });
  };

  const handleAddTransaction = async (e) => {
    e.preventDefault();
    if (!formData.coin || !formData.quantity || !formData.pricePerCoin) {
      setToast({ message: 'Please fill all required fields', type: 'error' });
      return;
    }

    setLoading(true);

    if (editingId) {
      try {
        await updateTransactionInFirestore(editingId, formData);
        setTransactions(transactions.map(t => t.id === editingId ? {
          ...formData,
          id: editingId,
          quantity: parseFloat(formData.quantity),
          pricePerCoin: parseFloat(formData.pricePerCoin),
          totalInvested: parseFloat(formData.quantity) * parseFloat(formData.pricePerCoin),
        } : t));
        setEditingId(null);
        setToast({ message: '✅ Updated in cloud!', type: 'success' });
      } catch (error) {
        setToast({ message: '❌ Failed to update: ' + error.message, type: 'error' });
      }
    } else {
      const newTransaction = {
        coin: formData.coin,
        symbol: formData.symbol.toUpperCase(),
        quantity: parseFloat(formData.quantity),
        pricePerCoin: parseFloat(formData.pricePerCoin),
        totalInvested: parseFloat(formData.quantity) * parseFloat(formData.pricePerCoin),
        date: formData.date || new Date().toISOString().split('T')[0],
        type: formData.type
      };

      try {
        const firestoreId = await saveTransactionToFirestore(newTransaction, user.uid);
        newTransaction.id = firestoreId;
        setTransactions([...transactions, newTransaction]);
        setToast({ message: '✅ Saved to cloud!', type: 'success' });
      } catch (error) {
        setToast({ message: '❌ Failed to save: ' + error.message, type: 'error' });
      }
    }

    setFormData({ coin: '', symbol: '', quantity: '', pricePerCoin: '', date: '', type: 'buy' });
    setShowForm(false);
    setLoading(false);
  };

  const handleDelete = async (id) => {
    if (window.confirm('Delete this transaction?')) {
      try {
        await deleteTransactionFromFirestore(id);
        setTransactions(transactions.filter(t => t.id !== id));
        setToast({ message: '✅ Deleted from cloud!', type: 'success' });
      } catch (error) {
        setToast({ message: '❌ Failed to delete: ' + error.message, type: 'error' });
      }
    }
  };

  const handleEdit = (tx) => {
    setFormData(tx);
    setEditingId(tx.id);
    setShowForm(true);
  };

  const handleDownloadCSV = () => {
    const csv = [['Date', 'Coin', 'Type', 'Quantity', 'Price', 'Total'].join(',')];
    filteredTransactions.forEach(tx => {
      csv.push([tx.date, tx.symbol, tx.type, tx.quantity, tx.pricePerCoin, tx.totalInvested].join(','));
    });
    const element = document.createElement('a');
    element.setAttribute('href', 'data:text/csv;charset=utf-8,' + encodeURIComponent(csv.join('\n')));
    element.setAttribute('download', 'transactions.csv');
    element.style.display = 'none';
    document.body.appendChild(element);
    element.click();
    setToast({ message: 'CSV downloaded!', type: 'success' });
  };

  const filteredTransactions = transactions
    .filter(tx => filterType === 'all' || tx.type === filterType)
    .filter(tx => tx.symbol.toLowerCase().includes(searchTerm.toLowerCase()) || tx.coin.toLowerCase().includes(searchTerm.toLowerCase()));

  return (
    <div className="page">
      <h1 className="animate-fade-in">📋 Transactions</h1>
      
      <div className="actions-bar animate-slide-down">
        <button className="btn-primary" onClick={() => { setShowForm(!showForm); setEditingId(null); }} disabled={loading}>
          {showForm ? '✕ Close' : '+ Add Transaction'}
        </button>
        <input type="text" placeholder="🔍 Search coins..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="search-input" />
        <select value={filterType} onChange={(e) => setFilterType(e.target.value)} className="filter-select">
          <option value="all">All Transactions</option>
          <option value="buy">🟢 Buys Only</option>
          <option value="sell">🔴 Sells Only</option>
        </select>
        {transactions.length > 0 && <button className="btn-success" onClick={handleDownloadCSV} disabled={loading}>📥 CSV</button>}
      </div>

      {toast && <Toast message={toast.message} type={toast.type} />}

      {showForm && (
        <form className="transaction-form animate-fade-in" onSubmit={handleAddTransaction}>
          <h2>{editingId ? '✏️ Edit Transaction' : '➕ Add Transaction'}</h2>
          <div className="form-group">
            <label>Coin Name *</label>
            <input type="text" name="coin" placeholder="e.g., Bitcoin" value={formData.coin} onChange={handleInputChange} required disabled={loading} />
          </div>
          <div className="form-group">
            <label>Symbol *</label>
            <input type="text" name="symbol" placeholder="e.g., BTC" value={formData.symbol} onChange={handleInputChange} required disabled={loading} />
          </div>
          <div className="form-row">
            <div className="form-group">
              <label>Quantity *</label>
              <input type="number" name="quantity" placeholder="e.g., 0.5" step="0.0001" value={formData.quantity} onChange={handleInputChange} required disabled={loading} />
            </div>
            <div className="form-group">
              <label>Price Per Coin (₹) *</label>
              <input type="number" name="pricePerCoin" placeholder="e.g., 50000" step="0.01" value={formData.pricePerCoin} onChange={handleInputChange} required disabled={loading} />
            </div>
          </div>
          <div className="form-row">
            <div className="form-group">
              <label>Date</label>
              <input type="date" name="date" value={formData.date} onChange={handleInputChange} disabled={loading} />
            </div>
            <div className="form-group">
              <label>Type</label>
              <select name="type" value={formData.type} onChange={handleInputChange} disabled={loading}>
                <option value="buy">🟢 Buy</option>
                <option value="sell">🔴 Sell</option>
              </select>
            </div>
          </div>
          <div className="form-actions">
            <button type="submit" className="btn-success" disabled={loading}>{editingId ? (loading ? '⏳ Updating...' : '✏️ Update') : (loading ? '⏳ Adding...' : '➕ Add')}</button>
            <button type="button" className="btn-cancel" onClick={() => { setShowForm(false); setEditingId(null); }} disabled={loading}>Cancel</button>
          </div>
        </form>
      )}

      {filteredTransactions.length > 0 && (
        <div className="transactions-list animate-fade-in">
          <h2>Transactions ({filteredTransactions.length})</h2>
          <div className="transactions-table">
            <div className="table-header">
              <div className="col-coin">Coin</div>
              <div className="col-qty">Qty</div>
              <div className="col-price">Price/Coin</div>
              <div className="col-total">Total</div>
              <div className="col-date">Date</div>
              <div className="col-type">Type</div>
              <div className="col-actions">Actions</div>
            </div>
            {filteredTransactions.map((tx) => (
              <div key={tx.id} className="table-row">
                <div className="col-coin"><strong>{tx.symbol}</strong><span>{tx.coin}</span></div>
                <div className="col-qty">{tx.quantity.toFixed(4)}</div>
                <div className="col-price">₹{tx.pricePerCoin.toFixed(2)}</div>
                <div className="col-total">₹{tx.totalInvested.toFixed(2)}</div>
                <div className="col-date">{tx.date}</div>
                <div className={`col-type type-${tx.type}`}>{tx.type}</div>
                <div className="col-actions">
                  <button className="btn-edit" onClick={() => handleEdit(tx)} disabled={loading}>✏️</button>
                  <button className="btn-delete" onClick={() => handleDelete(tx.id)} disabled={loading}>🗑️</button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {filteredTransactions.length === 0 && !showForm && (
        <div className="empty-state"><p>No transactions found. Try adding one or adjusting filters!</p></div>
      )}
    </div>
  );
}

// ==================== ANALYTICS PAGE ====================
function Analytics({ transactions, totalInvested, coinData, prices, taxInfo, user }) {
  if (!user) {
    return (
      <div className="page">
        <h1>📊 Analytics</h1>
        <div className="empty-state">
          <p>Please <Link to="/login">login</Link> to view analytics.</p>
        </div>
      </div>
    );
  }

  const currentValue = Object.values(coinData).reduce((sum, coin) => {
    const price = prices[coin.name] || 0;
    return sum + (coin.quantity * price);
  }, 0);

  const roi = calculateROI(totalInvested, currentValue);
  
  const coinMetrics = Object.values(coinData)
    .filter(c => c.quantity > 0)
    .map(coin => {
      const buys = transactions.filter(t => t.type === 'buy' && t.symbol === coin.name);
      const costBasis = calculateCostBasis(buys);
      const currentPrice = prices[coin.name] || 0;
      const gain = (currentPrice - costBasis) * coin.quantity;
      const gainPercent = costBasis > 0 ? ((currentPrice - costBasis) / costBasis) * 100 : 0;
      
      return {
        ...coin,
        costBasis,
        currentPrice,
        gain,
        gainPercent,
        currentValue: coin.quantity * currentPrice
      };
    });

  return (
    <div className="page">
      <h1 className="animate-fade-in">📊 Advanced Analytics</h1>
      
      <div className="analytics-grid animate-fade-in">
        <div className="analytics-card">
          <h3>Total Invested</h3>
          <p className="big-number">₹{totalInvested.toFixed(2)}</p>
        </div>
        <div className="analytics-card">
          <h3>Current Value</h3>
          <p className="big-number">₹{currentValue.toFixed(2)}</p>
        </div>
        <div className={`analytics-card ${(currentValue - totalInvested) >= 0 ? 'positive' : 'negative'}`}>
          <h3>Total Gain/Loss</h3>
          <p className="big-number">₹{Math.abs(currentValue - totalInvested).toFixed(2)}</p>
        </div>
        <div className="analytics-card">
          <h3>ROI</h3>
          <p className="big-number">{roi.toFixed(2)}%</p>
        </div>
        <div className="analytics-card">
          <h3>Short-term Tax</h3>
          <p className="big-number">₹{taxInfo.shortTermTax.toFixed(2)}</p>
        </div>
        <div className="analytics-card">
          <h3>Long-term Tax</h3>
          <p className="big-number">₹{taxInfo.longTermTax.toFixed(2)}</p>
        </div>
      </div>

      {coinMetrics.length > 0 && (
        <div className="analytics-table animate-fade-in" style={{ animationDelay: '0.2s' }}>
          <h2>💎 Coin-by-Coin Analysis</h2>
          <div className="breakdown-table">
            <div className="breakdown-header">
              <div className="col-coin">Coin</div>
              <div className="col-qty">Qty</div>
              <div className="col-price">Cost Basis</div>
              <div className="col-price">Live Price</div>
              <div className="col-value">Current Value</div>
              <div className="col-gain">Gain/Loss</div>
              <div className="col-gain">%</div>
            </div>
            {coinMetrics.map((coin) => (
              <div key={coin.name} className="breakdown-row">
                <div className="col-coin"><strong>{coin.name}</strong><span>{coin.coin}</span></div>
                <div className="col-qty">{coin.quantity.toFixed(4)}</div>
                <div className="col-price">₹{coin.costBasis.toFixed(2)}</div>
                <div className="col-price">₹{coin.currentPrice.toFixed(2)}</div>
                <div className="col-value">₹{coin.currentValue.toFixed(2)}</div>
                <div className={`col-gain ${coin.gain >= 0 ? 'text-green' : 'text-red'}`}>₹{coin.gain.toFixed(2)}</div>
                <div className={`col-gain ${coin.gainPercent >= 0 ? 'text-green' : 'text-red'}`}>{coin.gainPercent >= 0 ? '+' : ''}{coin.gainPercent.toFixed(2)}%</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ==================== TAX REPORTS PAGE ====================
function TaxReports({ transactions, totalInvested, coinData, prices, darkMode, taxInfo, user }) {
  if (!user) {
    return (
      <div className="page">
        <h1>💳 Tax Reports</h1>
        <div className="empty-state">
          <p>Please <Link to="/login">login</Link> to view tax reports.</p>
        </div>
      </div>
    );
  }

  const currentValue = Object.values(coinData).reduce((sum, coin) => {
    const price = prices[coin.name] || 0;
    return sum + (coin.quantity * price);
  }, 0);

  const afterTaxProfit = (currentValue - totalInvested) - taxInfo.totalTax;

  const handleDownloadReport = () => {
    const reportHTML = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>Crypto Tax Report - India</title>
        <style>
          body { font-family: Arial, sans-serif; padding: 30px; line-height: 1.6; background: #f5f5f5; }
          .container { max-width: 900px; margin: 0 auto; background: white; padding: 40px; border-radius: 10px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
          .header { text-align: center; margin-bottom: 40px; border-bottom: 3px solid #667eea; padding-bottom: 20px; }
          .header h1 { color: #667eea; margin: 0; font-size: 2em; }
          .header p { color: #666; margin: 5px 0; }
          .section { margin: 30px 0; }
          .section h2 { color: #333; border-left: 4px solid #667eea; padding-left: 15px; margin-top: 30px; }
          table { width: 100%; border-collapse: collapse; margin: 15px 0; }
          th { background-color: #667eea; color: white; padding: 12px; text-align: left; font-weight: bold; }
          td { border-bottom: 1px solid #ddd; padding: 10px; }
          tr:hover { background-color: #f9f9f9; }
          .summary-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin: 20px 0; }
          .summary-box { padding: 20px; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; border-radius: 8px; }
          .summary-box h3 { margin-top: 0; font-size: 0.9em; opacity: 0.9; }
          .summary-box .value { font-size: 2em; font-weight: bold; margin: 10px 0; }
          .summary-box .subtext { font-size: 0.85em; opacity: 0.8; }
          .warning { background-color: #fff3cd; border: 1px solid #ffc107; padding: 15px; border-radius: 5px; margin: 15px 0; }
          .warning strong { color: #856404; }
          .footer { margin-top: 40px; padding-top: 20px; border-top: 1px solid #ddd; font-size: 12px; color: #666; text-align: center; }
          .alert { color: #d32f2f; font-weight: bold; }
          .positive { color: #388e3c; }
          .negative { color: #d32f2f; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>💰 Crypto Tax Report - India</h1>
            <p>Generated: ${new Date().toLocaleDateString('en-IN')}</p>
            <p style="color: #999; font-size: 0.9em;">Financial Year: ${new Date().getFullYear()}-${new Date().getFullYear() + 1}</p>
          </div>

          <div class="section">
            <h2>📊 Executive Summary</h2>
            <div class="summary-grid">
              <div class="summary-box">
                <h3>Total Invested</h3>
                <div class="value">₹${totalInvested.toFixed(2)}</div>
                <div class="subtext">${transactions.filter(t => t.type === 'buy').length} buy transactions</div>
              </div>
              <div class="summary-box">
                <h3>Current Value</h3>
                <div class="value">₹${currentValue.toFixed(2)}</div>
                <div class="subtext">Live market prices</div>
              </div>
              <div class="summary-box">
                <h3>Total Realized Gain</h3>
                <div class="value positive">₹${taxInfo.totalRealizedGain.toFixed(2)}</div>
                <div class="subtext">From sold transactions</div>
              </div>
              <div class="summary-box">
                <h3>Total Tax Liability</h3>
                <div class="value alert">₹${taxInfo.totalTax.toFixed(2)}</div>
                <div class="subtext">As per India rules</div>
              </div>
            </div>
          </div>

          <div class="section">
            <h2>💼 Tax Breakdown (India Rules)</h2>
            <table>
              <tr>
                <th>Tax Category</th>
                <th>Gain Amount</th>
                <th>Tax Rate</th>
                <th>Tax Amount</th>
              </tr>
              <tr>
                <td>🔴 Short-term Capital Gain (&lt; 2 years)</td>
                <td>₹${taxInfo.shortTermGain.toFixed(2)}</td>
                <td>30% (Avg Income Tax Slab)</td>
                <td class="alert">₹${taxInfo.shortTermTax.toFixed(2)}</td>
              </tr>
              <tr>
                <td>🟢 Long-term Capital Gain (≥ 2 years)</td>
                <td>₹${taxInfo.longTermGain.toFixed(2)}</td>
                <td>20% (TDS)</td>
                <td>₹${taxInfo.longTermTax.toFixed(2)}</td>
              </tr>
              <tr style="background: #f0f0f0; font-weight: bold;">
                <td>Total Realized Gain</td>
                <td>₹${taxInfo.totalRealizedGain.toFixed(2)}</td>
                <td>--</td>
                <td class="alert">₹${taxInfo.totalTax.toFixed(2)}</td>
              </tr>
            </table>
          </div>

          <div class="section">
            <h2>📋 Detailed Transactions</h2>
            <table>
              <tr>
                <th>Date</th>
                <th>Coin</th>
                <th>Type</th>
                <th>Quantity</th>
                <th>Price (₹)</th>
                <th>Total (₹)</th>
              </tr>
              ${transactions.map(t => `
              <tr>
                <td>${t.date}</td>
                <td><strong>${t.symbol}</strong> (${t.coin})</td>
                <td>${t.type === 'buy' ? '🟢 BUY' : '🔴 SELL'}</td>
                <td>${t.quantity.toFixed(4)}</td>
                <td>₹${t.pricePerCoin.toFixed(2)}</td>
                <td>₹${t.totalInvested.toFixed(2)}</td>
              </tr>
              `).join('')}
            </table>
          </div>

          <div class="footer">
            <p>Generated by <strong>Crypto Tax Tool</strong> © 2025</p>
            <p>Made for Indian crypto traders</p>
            <p>Report generated on ${new Date().toLocaleString('en-IN')}</p>
          </div>
        </div>
      </body>
      </html>
    `;

    const element = document.createElement('a');
    element.setAttribute('href', 'data:text/html;charset=utf-8,' + encodeURIComponent(reportHTML));
    element.setAttribute('download', `crypto-tax-report-${new Date().getFullYear()}.html`);
    element.style.display = 'none';
    document.body.appendChild(element);
    element.click();
  };

  return (
    <div className="page">
      <h1 className="animate-fade-in">💳 Tax Reports (India Rules)</h1>
      
      <div className="tax-summary animate-fade-in">
        <div className="tax-card">
          <h3>Short-term Gain</h3>
          <p>₹{taxInfo.shortTermGain.toFixed(2)}</p>
          <span className="subtext">Taxed @ 30%</span>
        </div>
        <div className="tax-card">
          <h3>Long-term Gain</h3>
          <p>₹{taxInfo.longTermGain.toFixed(2)}</p>
          <span className="subtext">Taxed @ 20%</span>
        </div>
        <div className="tax-card">
          <h3>Total Tax Liability</h3>
          <p className="text-red">₹{taxInfo.totalTax.toFixed(2)}</p>
          <span className="subtext">Calculated as per India rules</span>
        </div>
        <div className="tax-card">
          <h3>After-Tax Profit</h3>
          <p className="text-green">₹{afterTaxProfit.toFixed(2)}</p>
          <span className="subtext">Net profit after tax</span>
        </div>
      </div>

      <div className="tax-info animate-fade-in" style={{ animationDelay: '0.2s' }}>
        <h2>📌 India Tax Rules Summary</h2>
        <div className="info-box">
          <h3>🔴 Short-term Capital Gain (Holding &lt; 2 years)</h3>
          <p>Taxed at your income tax slab rate (30% average for traders). This is added to your total income and taxed accordingly.</p>
          
          <h3 style={{ marginTop: '1.5rem' }}>🟢 Long-term Capital Gain (Holding ≥ 2 years)</h3>
          <p>Taxed at 20% flat rate with indexation benefit. Your cost basis is adjusted for inflation, reducing taxable gain.</p>
          
          <h3 style={{ marginTop: '1.5rem' }}>⚠️ No TDS if Gain &lt;  ₹2,50,000</h3>
          <p>If your realized gain is below ₹2,50,000, no TDS is deducted automatically, but you <strong>MUST report it in your tax return</strong>. Failure to report can attract penalties.</p>
          
          <h3 style={{ marginTop: '1.5rem' }}>📋 Carry Forward Losses</h3>
          <p>Capital losses can be carried forward for up to 8 years and set off against future capital gains. Current loss: ₹{taxInfo.totalLoss.toFixed(2)}</p>
          
          <h3 style={{ marginTop: '1.5rem' }}>📊 FIFO Method</h3>
          <p>This report uses FIFO (First In First Out) method to match your sold crypto with the earliest bought crypto, calculating the most accurate gains/losses.</p>
        </div>
      </div>

      <button className="btn-success" onClick={handleDownloadReport} style={{ marginTop: '2rem', width: '100%' }}>
        📥 Download Professional Tax Report (HTML)
      </button>

      <div style={{ background: '#fff3cd', border: '1px solid #ffc107', padding: '20px', borderRadius: '8px', marginTop: '2rem' }}>
        <strong style={{ color: '#856404' }}>⚠️ Important Disclaimer:</strong>
        <p style={{ color: '#856404', margin: '10px 0 0 0' }}>This report is for informational purposes only. It is NOT professional tax advice. Please consult with a qualified CA (Chartered Accountant) or tax advisor before filing your tax return. Tax laws are subject to change, and individual circumstances may vary. Crypto Tax Tool cannot be held responsible for any tax liability or penalties.</p>
      </div>

      {transactions.length === 0 && (
        <div className="empty-state" style={{ marginTop: '2rem' }}>
          <p>No transactions yet. Add some to see tax calculations!</p>
        </div>
      )}
    </div>
  );
}

// ==================== MAIN APP ====================
function App() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [darkMode, setDarkMode] = useState(false);
  const [transactions, setTransactions] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [prices, setPrices] = useState({});
  const [toast, setToast] = useState(null);
  const [formData, setFormData] = useState({ coin: '', symbol: '', quantity: '', pricePerCoin: '', date: '', type: 'buy' });

  // Check authentication
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      setLoading(false);
    });
    return unsubscribe;
  }, []);

  // Load transactions from Firestore when user logs in
  useEffect(() => {
    if (user) {
      loadTransactionsFromFirestore(user.uid).then(data => {
        setTransactions(data);
      });
    } else {
      setTransactions([]);
    }
  }, [user]);

  const handleLogout = async () => {
    if (window.confirm('Are you sure you want to logout?')) {
      try {
        await signOut(auth);
        setTransactions([]);
        setFormData({ coin: '', symbol: '', quantity: '', pricePerCoin: '', date: '', type: 'buy' });
        alert('Logged out!');
      } catch (error) {
        alert('Error: ' + error.message);
      }
    }
  };

  // Fetch live prices
  useEffect(() => {
    const fetchPrices = async () => {
      try {
        const coinSymbols = Array.from(new Set(transactions.map(t => t.coin.toLowerCase()))).join(',');
        if (coinSymbols) {
          const response = await fetch(`https://api.coingecko.com/api/v3/simple/price?ids=${coinSymbols}&vs_currencies=inr`);
          const data = await response.json();
          const newPrices = {};
          transactions.forEach(t => {
            newPrices[t.symbol] = data[t.coin.toLowerCase()]?.inr || newPrices[t.symbol] || t.pricePerCoin;
          });
          setPrices(newPrices);
        }
      } catch (err) {
        console.log('Price fetch failed');
      }
    };

    fetchPrices();
    const interval = setInterval(fetchPrices, 60000);
    return () => clearInterval(interval);
  }, [transactions]);

  const totalInvested = transactions.filter(t => t.type === 'buy').reduce((sum, t) => sum + t.totalInvested, 0);
  const totalQuantity = transactions.reduce((sum, t) => t.type === 'buy' ? sum + t.quantity : sum - t.quantity, 0);

  const coinData = {};
  transactions.forEach(tx => {
    if (!coinData[tx.symbol]) {
      coinData[tx.symbol] = { name: tx.symbol, coin: tx.coin, quantity: 0, value: 0 };
    }
    if (tx.type === 'buy') {
      coinData[tx.symbol].quantity += tx.quantity;
      coinData[tx.symbol].value += tx.totalInvested;
    } else {
      coinData[tx.symbol].quantity -= tx.quantity;
    }
  });

  const currentValue = Object.values(coinData).reduce((sum, coin) => {
    const price = prices[coin.name] || 0;
    return sum + (coin.quantity * price);
  }, 0);

  const taxInfo = calculateIndianTax(transactions, totalInvested, currentValue, prices);

  const historicalData = [];
  let runningTotal = 0;
  transactions.sort((a, b) => new Date(a.date) - new Date(b.date)).forEach(tx => {
    if (tx.type === 'buy') {
      runningTotal += tx.totalInvested;
    } else {
      runningTotal -= tx.totalInvested;
    }
    const existing = historicalData.find(h => h.date === tx.date);
    if (existing) {
      existing.invested = runningTotal;
    } else {
      historicalData.push({ date: tx.date, invested: runningTotal });
    }
  });

  useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => setToast(null), 3000);
      return () => clearTimeout(timer);
    }
  }, [toast]);

  // Show loading screen
  if (loading) {
    return (
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: '100vh',
        background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
        color: 'white',
        fontSize: '20px'
      }}>
        ⏳ Loading...
      </div>
    );
  }

  // Main App (always show, with auth in navbar)
  return (
    <Router>
      <div className={`App ${darkMode ? 'dark-mode' : ''}`}>
        <nav className="navbar">
          <div className="nav-container">
            <Link to="/" className="nav-logo">💰 Crypto Tax Tool</Link>
            <ul className="nav-menu">
              <li><Link to="/" className="nav-link">🏠 Home</Link></li>
              {user ? (
                <>
                  <li><Link to="/transactions" className="nav-link">📋 Transactions</Link></li>
                  <li><Link to="/analytics" className="nav-link">📊 Analytics</Link></li>
                  <li><Link to="/tax-reports" className="nav-link">💳 Tax Reports</Link></li>
                  <li className="user-info">
                    <span className="user-email">👤 {user.email}</span>
                  </li>
                  <li>
                    <button 
                      className="dark-mode-toggle" 
                      onClick={() => setDarkMode(!darkMode)}
                    >
                      {darkMode ? '☀️' : '🌙'}
                    </button>
                  </li>
                  <li>
                    <button className="btn-logout" onClick={handleLogout}>
                      🚪 Logout
                    </button>
                  </li>
                </>
              ) : (
                <>
                  <li>
                    <button 
                      className="dark-mode-toggle" 
                      onClick={() => setDarkMode(!darkMode)}
                    >
                      {darkMode ? '☀️' : '🌙'}
                    </button>
                  </li>
                  <li><Link to="/login" className="nav-link btn-nav">🔐 Login</Link></li>
                  <li><Link to="/signup" className="nav-link btn-nav">📝 Sign Up</Link></li>
                </>
              )}
            </ul>
          </div>
        </nav>

        <div className="container">
          {toast && <Toast message={toast.message} type={toast.type} />}
          <Routes>
            <Route path="/" element={<Home transactions={transactions} totalInvested={totalInvested} totalQuantity={totalQuantity} historicalData={historicalData} coinData={coinData} darkMode={darkMode} prices={prices} taxInfo={taxInfo} user={user} />} />
            <Route path="/transactions" element={<Transactions transactions={transactions} setTransactions={setTransactions} showForm={showForm} setShowForm={setShowForm} formData={formData} setFormData={setFormData} darkMode={darkMode} toast={toast} setToast={setToast} user={user} />} />
            <Route path="/analytics" element={<Analytics transactions={transactions} totalInvested={totalInvested} coinData={coinData} prices={prices} taxInfo={taxInfo} user={user} />} />
            <Route path="/tax-reports" element={<TaxReports transactions={transactions} totalInvested={totalInvested} coinData={coinData} prices={prices} darkMode={darkMode} taxInfo={taxInfo} user={user} />} />
            <Route path="/signup" element={<SignUp />} />
            <Route path="/login" element={<Login />} />
          </Routes>
        </div>

        <footer className="footer">
          <p>💎 Crypto Tax Tool © 2025 | Made for Indian traders with ❤️</p>
        </footer>
      </div>
    </Router>
  );
}

export default App;