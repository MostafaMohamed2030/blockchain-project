const fs = require('fs');
const readline = require('readline');
const EC = require('elliptic').ec;
const Blockchain = require('./blockchain');
const Transaction = require('./transaction');
const { createServer, connectToPeer, broadcast, publicKeys } = require('./network');
const Block = require('./block');
const userPorts = require('./userPorts');
const qrcode = require('qrcode');
const path = require('path');
const MinerManager = require('./minerManager');
const ClientManager = require('./clientManager');

// إضافة استيراد نظام الرسائل
const MessagingSystem = require('./messaging');
const messagingSystem = new MessagingSystem();

const ec = new EC('secp256k1');
const args = process.argv.slice(2);
const userName = args[0] || 'node1';
const port = parseInt(args[1]) || 6001;

const key = ec.genKeyPair();
const publicKey = key.getPublic('hex');

// Initialize managers
const minerManager = new MinerManager();
const clientManager = new ClientManager();

// إنشاء واجهة readline
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

// تعريف دالة question
function question(query) {
  return new Promise((resolve) => {
    rl.question(query, resolve);
  });
}

// تعريف دالة prompt
function prompt(query) {
  return new Promise((resolve) => {
    rl.question(query, resolve);
  });
}

logEvent(`🟢 Node "${userName}" started on port ${port} with public key: ${publicKey}`);
console.log("🔑 Your public key (token):", publicKey);

const savjeeCoin = new Blockchain();
createServer(port, handleMessage, () => publicKey)
  .then(() => {
    console.log('✅ Server started successfully');
    main();
  })
  .catch(err => {
    console.error('❌ Failed to start server:', err.message);
    process.exit(1);
  });

function logEvent(message) {
  const logMsg = `[${new Date().toISOString()}] ${message}\n`;
  fs.appendFileSync('logs.txt', logMsg);
}

function handleMessage(message, socket) {
  try {
    const strMessage = typeof message === "string" ? message : message.toString();

    if (strMessage.startsWith("TX:")) {
      const txData = JSON.parse(strMessage.slice(3));
      const tx = Object.assign(new Transaction(), txData);
      logEvent(`📩 Received transaction from network: ${JSON.stringify(txData)}`);
      savjeeCoin.addTransaction(tx);
      console.log("📩 Received transaction:", txData);
    } else if (strMessage.startsWith("ALERT:")) {
      const alert = strMessage.slice(6);
      logEvent(`🚨 Received alert: ${alert}`);
      console.log("🚨 ALERT:", alert);
    } else {
      console.log("📩 Received unknown message:", strMessage);
    }
  } catch (err) {
    console.log("⚠️ Failed to handle message:", err.message);
  }
}

function printMenu() {
  console.log('\n=== Blockchain CLI ===');
  console.log('1. Client Management');
  console.log('2. Miner Management');
  console.log('3. Transaction Management');
  console.log('4. Network Management');
  console.log('5. Blockchain Explorer');
  console.log('6. System Statistics');
  console.log('7. Exit');
}

function saveKeysToFile(publicKey, privateKey, userName) {
  const keysDir = path.join(__dirname, '..', 'keys');
  if (!fs.existsSync(keysDir)) {
    fs.mkdirSync(keysDir, { recursive: true });
  }

  const keyData = {
    publicKey,
    privateKey,
    userName,
    createdAt: new Date().toISOString()
  };

  const fileName = `${userName}.key.json`;
  const filePath = path.join(keysDir, fileName);
  
  try {
    fs.writeFileSync(filePath, JSON.stringify(keyData, null, 2));
    console.log(`\n✅ Keys saved to: ${fileName}`);
  } catch (err) {
    console.log('❌ Error saving keys:', err.message);
    throw err;
  }
}

function importKeysFromFile() {
  console.log('\n📂 ====== Import Keys ====== 📂');
  const keysDir = path.join(__dirname, '..', 'keys');
  
  if (!fs.existsSync(keysDir)) {
    console.log('❌ No keys directory found!');
    return null;
  }

  const files = fs.readdirSync(keysDir).filter(file => file.endsWith('.key.json'));
  
  if (files.length === 0) {
    console.log('❌ No key files found!');
    return null;
  }

  console.log('\nAvailable key files:');
  files.forEach((file, index) => {
    console.log(`${index + 1}. ${file}`);
  });

  rl.question('\nSelect file number to import (or 0 to cancel): ', (choice) => {
    const index = parseInt(choice) - 1;
    if (index >= 0 && index < files.length) {
      const filePath = path.join(keysDir, files[index]);
      const keyData = JSON.parse(fs.readFileSync(filePath, 'utf8'));
      
      console.log('\n✅ Keys imported successfully!');
      console.log(`Public Key: ${keyData.publicKey}`);
      console.log(`Created: ${new Date(keyData.createdAt).toLocaleString()}`);
      
      return keyData;
    } else {
      console.log('❌ Invalid selection!');
      return null;
    }
  });
}

async function viewUserTokens() {
  console.log('\n🔑 ====== User Tokens ====== 🔑');
  const users = savjeeCoin.userData.getAllUsers();
  
  if (users.length === 0) {
    console.log('No users found!');
  } else {
    for (const user of users) {
      console.log(`\n👤 User #${users.indexOf(user) + 1}:`);
      console.log('========================================');
      
      // عرض المفتاح العام مع QR Code
      console.log(`📝 Address (Public Key):`);
      console.log(`${user.address}`);
      try {
        const qrCode = await qrcode.toString(user.address, { type: 'terminal' });
        console.log('\nQR Code for Public Key:');
        console.log(qrCode);
      } catch (err) {
        console.log('❌ Failed to generate QR code');
      }
      
      // عرض المفتاح الخاص إذا كان موجوداً
      if (user.privateKey) {
        console.log(`\n🔒 Private Key:`);
        console.log(`${user.privateKey}`);
        try {
          const qrCode = await qrcode.toString(user.privateKey, { type: 'terminal' });
          console.log('\nQR Code for Private Key:');
          console.log(qrCode);
        } catch (err) {
          console.log('❌ Failed to generate QR code');
        }
      } else {
        console.log('\n🔒 Private Key: Not available');
      }
      
      // عرض معلومات إضافية
      console.log(`\n💰 Balance: ${user.balance}`);
      console.log(`📊 Total Transactions: ${user.transactions.length}`);
      
      // عرض آخر 3 معاملات
      if (user.transactions.length > 0) {
        console.log('\n🔄 Recent Transactions:');
        const recentTxs = user.transactions.slice(-3).reverse();
        recentTxs.forEach((tx, i) => {
          console.log(`\nTransaction #${i + 1}:`);
          if (tx.fromAddress === null) {
            console.log(`Type: Mining Reward`);
            console.log(`Amount: ${tx.amount}`);
          } else {
            console.log(`Type: ${tx.fromAddress === user.address ? 'Sent' : 'Received'}`);
            console.log(`Amount: ${tx.amount}`);
            console.log(`From/To: ${tx.fromAddress === user.address ? tx.toAddress : tx.fromAddress}`);
          }
          console.log(`Time: ${new Date(tx.timestamp).toLocaleString()}`);
        });
      }
      
      // عرض إحصائيات إضافية
      console.log('\n📈 User Statistics:');
      const sentCount = user.transactions.filter(tx => tx.fromAddress === user.address).length;
      const receivedCount = user.transactions.filter(tx => tx.toAddress === user.address).length;
      const minedCount = user.transactions.filter(tx => tx.fromAddress === null).length;
      
      console.log(`Sent Transactions: ${sentCount}`);
      console.log(`Received Transactions: ${receivedCount}`);
      console.log(`Mined Blocks: ${minedCount}`);
      
      // عرض معلومات الأمان
      console.log('\n🔐 Security Information:');
      console.log(`Last Activity: ${new Date(user.lastActive || Date.now()).toLocaleString()}`);
      console.log(`Account Status: ${user.isActive ? 'Active' : 'Inactive'}`);
      
      console.log('========================================');
    }
  }
  
  console.log('\n📋 Summary:');
  console.log(`Total Users: ${users.length}`);
  console.log(`Total Transactions: ${users.reduce((sum, user) => sum + user.transactions.length, 0)}`);
  console.log(`Total Balance: ${users.reduce((sum, user) => sum + user.balance, 0)}`);
  console.log('🔑 ========================== 🔑\n');
  
  setTimeout(showUserManagementMenu, 2000);
}

async function showAllUsersTable() {
  console.clear();
  console.log('\n🔷 ====== All Users in Network ====== 🔷\n');
  
  const users = savjeeCoin.userData.getAllUsers();
  if (users.length === 0) {
    console.log('No users found in the network!');
    await question('\nPress Enter to return to menu...');
    return;
  }

  // Table header
  console.log('┌────────────────────┬────────────┬────────────┬────────────┬────────────┬────────────┐');
  console.log('│      Address       │   Balance  │  Sent Tx   │  Recv Tx   │  Mined Tx  │ Last Active│');
  console.log('├────────────────────┼────────────┼────────────┼────────────┼────────────┼────────────┤');

  // Table rows
  users.forEach(user => {
    const stats = savjeeCoin.getUserStatistics(user.address);
    if (stats) {
      const address = stats.address.substring(0, 16) + '...';
      const balance = stats.balance.toString().padStart(10);
      const sentTx = stats.sentTransactions.toString().padStart(10);
      const recvTx = stats.receivedTransactions.toString().padStart(10);
      const minedTx = stats.minedBlocks.toString().padStart(10);
      const lastActive = new Date(stats.lastActive).toLocaleDateString().padStart(10);

      console.log(`│ ${address.padEnd(18)} │ ${balance} │ ${sentTx} │ ${recvTx} │ ${minedTx} │ ${lastActive} │`);
    }
  });

  // Table footer
  console.log('└────────────────────┴────────────┴────────────┴────────────┴────────────┴────────────┘');

  // Additional statistics
  console.log('\n📊 Network Statistics:');
  console.log(`Total Users: ${users.length}`);
  console.log(`Total Balance in Network: ${users.reduce((sum, user) => sum + user.balance, 0)}`);
  console.log(`Active Users (Last Hour): ${savjeeCoin.getActiveUsers().length}`);

  await question('\nPress Enter to return to menu...');
}

async function displayUsersTable() {
  console.log('\n📊 Active Clients:');
  console.log('┌────────────────────────────────────────────────────────────────────────────────────────────────────┬────────────┬────────────┬────────────┬────────────┬────────────┐');
  console.log('│                                               Address                                               │   Balance  │  Sent Tx   │  Recv Tx   │  Mined Tx  │ Last Active│');
  console.log('├────────────────────────────────────────────────────────────────────────────────────────────────────┼────────────┼────────────┼────────────┼────────────┼────────────┤');

  const clients = clientManager.getAllClients();
  clients.forEach(client => {
    const sentTxs = client.transactions.filter(tx => tx.fromAddress === client.address).length;
    const receivedTxs = client.transactions.filter(tx => tx.toAddress === client.address && tx.fromAddress !== null).length;
    const minedTxs = client.transactions.filter(tx => tx.fromAddress === null).length;
    const lastActiveDate = new Date(client.lastActive).toLocaleString();

    console.log(
      `│${client.address.padEnd(100)}│${client.balance.toString().padStart(12)}│` +
      `${sentTxs.toString().padStart(12)}│${receivedTxs.toString().padStart(12)}│` +
      `${minedTxs.toString().padStart(12)}│${lastActiveDate.padStart(12)}│`
    );
  });

  console.log('└────────────────────────────────────────────────────────────────────────────────────────────────────┴────────────┴────────────┴────────────┴────────────┴────────────┘\n');
}

async function showWalletManagement() {
  while (true) {
    console.clear();
    console.log('\n🔷 ====== Wallet Management ====== 🔷');
    console.log('1. Create New Wallet');
    console.log('2. View Existing Wallets');
    console.log('3. Delete Wallet');
    console.log('4. View Wallet Details');
    console.log('5. View All Users Table');
    console.log('0. Return to Main Menu');

    await displayUsersTable();  // عرض الجدول في كل مرة

    const choice = await question('\nEnter your choice: ');

    switch (choice) {
      case '1':
        await createNewWallet();
        break;
      case '2':
        await viewExistingWallets();
        break;
      case '3':
        await deleteWallet();
        break;
      case '4':
        await viewWalletDetails();
        break;
      case '5':
        await showAllUsersTable();
        break;
      case '0':
        return;
      default:
        console.log('Invalid choice!');
        await question('\nPress Enter to continue...');
    }
  }
}

async function viewExistingWallets() {
  console.clear();
  console.log('\n=== Existing Wallets ===');
  const users = savjeeCoin.userData.getAllUsers();
  
  if (users.length === 0) {
    console.log('No wallets found!');
    await question('\nPress Enter to return to menu...');
    return;
  } else {
    users.forEach((user, index) => {
      console.log(`\nWallet #${index + 1}:`);
      console.log(`Address: ${user.address}`);
      console.log(`Balance: ${user.balance}`);
      console.log(`Total Transactions: ${user.transactions.length}`);
      console.log(`Created: ${new Date(user.createdAt).toLocaleString()}`);
      console.log(`Last Active: ${new Date(user.lastActive).toLocaleString()}`);
    });

    console.log('\nOptions:');
    console.log('0. Return to menu');
    const choice = await question('Enter your choice: ');
    if (choice === '0') {
      return;
    }
  }
}

async function showTransactionManagement() {
  while (true) {
    console.clear();
    console.log('\n🔷 ====== Transaction Management ====== 🔷');
    console.log('1. Send Transaction');
    console.log('2. Mine Pending Transactions');
    console.log('3. View Pending Transactions');
    console.log('0. Return to Main Menu');

    await displayUsersTable();

    const choice = await question('\nEnter your choice: ');

    switch (choice) {
      case '1':
        await sendTransaction();
        break;
      case '2':
        await mineTransactions();
        break;
      case '3':
        await viewPendingTransactions();
        break;
      case '0':
        return;
      default:
        console.log('❌ Invalid choice. Please try again.');
        await new Promise(resolve => setTimeout(resolve, 2000));
    }
  }
}

async function sendTransaction() {
  console.clear();
  console.log('\n💸 Send Transaction');
  
  try {
    // Get transaction information
    const fromAddress = await question('Enter your address: ');
    const toAddress = await question('Enter recipient address: ');
    const amount = parseFloat(await question('Enter amount: '));

    // Validate inputs
    if (isNaN(amount) || amount <= 0) {
      throw new Error('Invalid amount. Please enter a positive number.');
    }

    // Get sender client
    const sender = clientManager.getClient(fromAddress);
    if (!sender) {
      throw new Error('Sender address not found in clients list');
    }

    // Get recipient client
    const recipient = clientManager.getClient(toAddress);
    if (!recipient) {
      throw new Error('Recipient address not found in clients list');
    }

    // Check balance
    if (sender.balance < amount) {
      throw new Error(`Insufficient balance. Available: ${sender.balance}`);
    }

    // Create and sign transaction
    console.log('\nCreating and signing transaction...');
    const tx = new Transaction(fromAddress, toAddress, amount);
    
    // Create signing key from sender's private key
    const signingKey = ec.keyFromPrivate(sender.privateKey);
    tx.signTransaction(signingKey);

    // Add transaction to pending transactions
    console.log('Adding transaction to pending transactions...');
    savjeeCoin.addTransaction(tx);

    console.log('\n✅ Transaction added to pending transactions successfully!');
    console.log(`Amount: ${amount}`);
    console.log(`From: ${fromAddress}`);
    console.log(`To: ${toAddress}`);
    console.log('\nNote: Transaction will be processed after mining.');
    console.log('Current balances will be updated after the transaction is mined.');
    console.log(`Current Sender Balance: ${sender.balance}`);
    console.log(`Current Recipient Balance: ${recipient.balance}`);
  } catch (error) {
    console.log(`\n❌ Error: ${error.message}`);
    if (error.message.includes('signature')) {
      console.log('This might be due to an invalid private key or signature issue.');
    }
  }

  await question('\nPress Enter to continue...');
}

async function mineTransactions() {
  console.clear();
  console.log('\n⛏️ Mine Pending Transactions');
  
  // First check if there are any pending transactions
  const pendingTransactions = savjeeCoin.getPendingTransactions();
  if (pendingTransactions.length === 0) {
    console.log('\nNo pending transactions to mine!');
    await question('\nPress Enter to continue...');
    return;
  }

  console.log(`\nFound ${pendingTransactions.length} pending transactions waiting to be mined.`);
  
  const minerId = await question('Enter miner ID: ');

  try {
    // Get miner information
    const miners = minerManager.loadMiners();
    const miner = miners.find(m => m.id === minerId);
    if (!miner) {
      throw new Error('Miner not found');
    }

    console.log('\nMining pending transactions...');
    
    const block = savjeeCoin.minePendingTransactions(minerId);
    if (!block) {
      throw new Error('Failed to mine block');
    }

    await question('\nPress Enter to continue...');
  } catch (error) {
    console.log(`\n❌ Error: ${error.message}`);
    await question('\nPress Enter to continue...');
  }
}

async function viewPendingTransactions() {
  console.clear();
  console.log('\n📋 Pending Transactions');
  
  const pendingTxs = blockchain.getPendingTransactions();
  
  if (pendingTxs.length === 0) {
    console.log('No pending transactions.');
  } else {
    pendingTxs.forEach((tx, index) => {
      console.log(`\nTransaction #${index + 1}:`);
      blockchain.printTransactionInfo(tx);
    });
  }

  await question('\nPress Enter to continue...');
}

async function showNetworkManagement() {
  while (true) {
    console.clear();
    console.log('\n🔷 ====== Network Management ====== 🔷');
    console.log('1. List Connected Nodes');
    console.log('2. Connect to Node');
    console.log('3. Broadcast Message');
    console.log('4. View Network Status');
    console.log('0. Return to Main Menu');

    await displayUsersTable();  // عرض الجدول في كل مرة

    const choice = await question('\nEnter your choice: ');

    switch (choice) {
      case '1':
        await listConnectedNodes();
        break;
      case '2':
        await connectToNode();
        break;
      case '3':
        await broadcastMessage();
        break;
      case '4':
        await viewNetworkStatus();
        break;
      case '0':
        return;
      default:
        console.log('Invalid choice!');
        await question('\nPress Enter to continue...');
    }
  }
}

async function showBlockchainExplorer() {
  while (true) {
    console.clear();
    console.log('\n🔷 ====== Blockchain Explorer ====== 🔷');
    console.log('1. View Latest Block');
    console.log('2. View Block by Hash');
    console.log('3. View Block by Index');
    console.log('4. View Transaction by Hash');
    console.log('0. Return to Main Menu');

    await displayUsersTable();  // عرض الجدول في كل مرة

    const choice = await question('\nEnter your choice: ');

    switch (choice) {
      case '1':
        await viewLatestBlock();
        break;
      case '2':
        await viewBlockByHash();
        break;
      case '3':
        await viewBlockByIndex();
        break;
      case '4':
        await viewTransactionByHash();
        break;
      case '0':
        return;
      default:
        console.log('Invalid choice!');
        await question('\nPress Enter to continue...');
    }
  }
}

function showWalletManagementMenu() {
  console.log('\n👛 ====== Wallet Management ====== 👛');
  console.log('1. Create New Wallet');
  console.log('2. View Existing Wallets');
  console.log('3. Delete Wallet');
  console.log('4. View Wallet Details');
  console.log('5. Back to Main Menu');
  console.log('👛 ========================== 👛\n');

  rl.question('Select an option (1-5): ', (option) => {
    switch (option) {
      case '1':
        createNewWallet();
        break;
      case '2':
        viewExistingWallets();
        break;
      case '3':
        deleteWallet();
        break;
      case '4':
        viewWalletDetails();
        break;
      case '5':
        main();
        break;
      default:
        console.log('❌ Invalid option!');
        setTimeout(showWalletManagementMenu, 2000);
    }
  });
}

function viewWalletDetails() {
  console.log('\n👤 ====== Wallet Details ====== 👤');
  rl.question('Enter wallet address: ', (address) => {
    if (!address || address.trim() === '') {
      console.log('❌ Address cannot be empty!');
      setTimeout(showWalletManagementMenu, 2000);
      return;
    }
    
    const userData = savjeeCoin.userData.getUserData(address);
    if (userData) {
      console.log('\nWallet Information:');
      console.log(`Address: ${address}`);
      console.log(`Balance: ${userData.balance}`);
      console.log(`Total Transactions: ${userData.transactions.length}`);
      
      // عرض معلومات الملف
      const keysDir = path.join(__dirname, '..', 'keys');
      const keyFiles = fs.readdirSync(keysDir).filter(file => file.endsWith('.key.json'));
      for (const file of keyFiles) {
        const filePath = path.join(keysDir, file);
        const keyData = JSON.parse(fs.readFileSync(filePath, 'utf8'));
        if (keyData.publicKey === address) {
          console.log(`\nKey File: ${file}`);
          console.log(`Created: ${new Date(keyData.createdAt).toLocaleString()}`);
          break;
        }
      }
      
      console.log('\nRecent Transactions:');
      const recentTxs = userData.transactions.slice(-5).reverse();
      recentTxs.forEach((tx, index) => {
        console.log(`\nTransaction #${index + 1}:`);
        if (tx.fromAddress === null) {
          console.log(`Type: Mining Reward`);
          console.log(`Amount: ${tx.amount}`);
        } else {
          console.log(`Type: ${tx.fromAddress === address ? 'Sent' : 'Received'}`);
          console.log(`Amount: ${tx.amount}`);
          console.log(`From/To: ${tx.fromAddress === address ? tx.toAddress : tx.fromAddress}`);
        }
        console.log(`Time: ${new Date(tx.timestamp).toLocaleString()}`);
      });
    } else {
      console.log('❌ Wallet not found!');
    }
    console.log('👤 ========================== 👤\n');
    setTimeout(showWalletManagementMenu, 2000);
  });
}

async function createNewWallet() {
  console.clear();
  console.log('\n🔷 ====== Create New Wallet ====== 🔷\n');
  
  const clientId = await question('Enter client ID: ');
  const initialBalance = parseFloat(await question('Enter initial balance (0 if none): ')) || 0;

  try {
    const client = clientManager.createClient(clientId);
    if (initialBalance > 0) {
      clientManager.updateClientBalance(client.address, initialBalance);
    }
    console.log('\n✅ Client created successfully!');
    console.log(`Client ID: ${client.clientId}`);
    console.log(`Address: ${client.address}`);
    console.log(`Initial Balance: ${initialBalance}`);
  } catch (error) {
    console.log('\n❌ Error creating client:', error.message);
  }
}

function deleteWallet() {
  console.log('\n🗑 ====== Delete Wallet ====== 🗑');
  
  // Get users from blockchain
  const users = savjeeCoin.userData.getAllUsers();
  if (users.length === 0) {
    console.log('❌ No wallets found!');
    setTimeout(showWalletManagementMenu, 2000);
    return;
  }

  console.log('\nExisting Wallets:');
  users.forEach((user, index) => {
    console.log(`${index + 1}. Address: ${user.address}`);
    console.log(`   Balance: ${user.balance}`);
  });

  rl.question('\nSelect wallet number to delete (or 0 to cancel): ', (choice) => {
    const index = parseInt(choice) - 1;
    if (index >= 0 && index < users.length) {
      const selectedUser = users[index];
      
      // Delete key file
      const keysDir = path.join(__dirname, '..', 'keys');
      const keyFiles = fs.readdirSync(keysDir).filter(file => file.endsWith('.key.json'));
      
      for (const file of keyFiles) {
        const filePath = path.join(keysDir, file);
        const keyData = JSON.parse(fs.readFileSync(filePath, 'utf8'));
        if (keyData.publicKey === selectedUser.address) {
          fs.unlinkSync(filePath);
          console.log(`✅ Deleted key file: ${file}`);
          break;
        }
      }
      
      // Delete user from blockchain
      savjeeCoin.userData.deleteUser(selectedUser.address);
      console.log(`✅ Wallet deleted successfully!`);
      
    } else if (choice !== '0') {
      console.log('❌ Invalid selection!');
    }
    setTimeout(showWalletManagementMenu, 2000);
  });
}

// إضافة دالة حذف المستخدم في UserData
function deleteUser(address) {
  const userIndex = this.users.findIndex(user => user.address === address);
  if (userIndex !== -1) {
    this.users.splice(userIndex, 1);
    return true;
  }
  return false;
}

// إضافة متغير للتحكم في الصعوبة
let miningDifficulty = 2;

function checkBalance() {
  rl.question('Enter wallet address: ', (address) => {
    // التحقق من وجود المستخدم
    if (!savjeeCoin.userData.getUserData(address)) {
      console.log('❌ User not found!');
      setTimeout(main, 2000);
      return;
    }
    
    const balance = savjeeCoin.getBalanceOfAddress(address);
    console.log('\n💰 ====== Balance Information ====== 💰');
    console.log(`Address: ${address}`);
    console.log(`Balance: ${balance}`);
    console.log('💰 ============================== 💰\n');
    setTimeout(main, 2000);
  });
}

function showUserDetails() {
  console.log('\n👤 ====== User Details ====== 👤');
  rl.question('Enter user address: ', async (address) => {
    if (!address || address.trim() === '') {
      console.log('❌ Address cannot be empty!');
      setTimeout(showUserManagementMenu, 2000);
      return;
    }
    
    const userData = savjeeCoin.userData.getUserData(address);
    if (userData) {
      console.log('\n📋 User Information:');
      console.log('========================================');
      console.log(`👤 Address: ${address}`);
      console.log(`💰 Balance: ${userData.balance}`);
      console.log(`📅 Created: ${new Date(userData.createdAt).toLocaleString()}`);
      console.log(`⏰ Last Active: ${new Date(userData.lastActive).toLocaleString()}`);
      
      // عرض المفتاح العام مع QR Code
      console.log('\n🔑 Public Key:');
      console.log(userData.address);
      try {
        const qrCode = await qrcode.toString(userData.address, { type: 'terminal' });
        console.log('\nQR Code for Public Key:');
        console.log(qrCode);
      } catch (err) {
        console.log('❌ Failed to generate QR code');
      }
      
      // عرض المفتاح الخاص إذا كان موجوداً
      if (userData.privateKey) {
        console.log('\n🔒 Private Key:');
        console.log(userData.privateKey);
        try {
          const qrCode = await qrcode.toString(userData.privateKey, { type: 'terminal' });
          console.log('\nQR Code for Private Key:');
          console.log(qrCode);
        } catch (err) {
          console.log('❌ Failed to generate QR code');
        }
      }
      
      // عرض إحصائيات المعاملات
      console.log('\n📊 Transaction Statistics:');
      const sentTxs = userData.transactions.filter(tx => tx.fromAddress === address);
      const receivedTxs = userData.transactions.filter(tx => tx.toAddress === address);
      const minedTxs = userData.transactions.filter(tx => tx.fromAddress === null);
      
      console.log(`Total Transactions: ${userData.transactions.length}`);
      console.log(`Sent Transactions: ${sentTxs.length}`);
      console.log(`Received Transactions: ${receivedTxs.length}`);
      console.log(`Mined Blocks: ${minedTxs.length}`);
      
      // عرض تفاصيل المعاملات
      console.log('\n💸 Transaction History:');
      userData.transactions.forEach((tx, index) => {
        console.log(`\nTransaction #${index + 1}:`);
        if (tx.fromAddress === null) {
          console.log(`Type: Mining Reward`);
          console.log(`Amount: +${tx.amount}`);
          console.log(`Reason: Block mining reward`);
        } else if (tx.fromAddress === address) {
          console.log(`Type: Sent`);
          console.log(`Amount: -${tx.amount}`);
          console.log(`To: ${tx.toAddress}`);
          console.log(`Reason: Transfer to another user`);
        } else {
          console.log(`Type: Received`);
          console.log(`Amount: +${tx.amount}`);
          console.log(`From: ${tx.fromAddress}`);
          console.log(`Reason: Transfer from another user`);
        }
        console.log(`Time: ${new Date(tx.timestamp).toLocaleString()}`);
      });
      
      // عرض إحصائيات إضافية
      console.log('\n📈 Additional Statistics:');
      const totalSent = sentTxs.reduce((sum, tx) => sum + tx.amount, 0);
      const totalReceived = receivedTxs.reduce((sum, tx) => sum + tx.amount, 0);
      const totalMined = minedTxs.reduce((sum, tx) => sum + tx.amount, 0);
      
      console.log(`Total Sent: ${totalSent}`);
      console.log(`Total Received: ${totalReceived}`);
      console.log(`Total Mined: ${totalMined}`);
      console.log(`Net Balance Change: ${totalReceived + totalMined - totalSent}`);
      
      // عرض معلومات الأمان
      console.log('\n🔐 Security Information:');
      console.log(`Account Status: ${userData.isActive ? 'Active' : 'Inactive'}`);
      console.log(`Last Activity: ${new Date(userData.lastActive).toLocaleString()}`);
      
      console.log('========================================');
    } else {
      console.log('❌ User not found!');
    }
    console.log('👤 ========================== 👤\n');
    setTimeout(showUserManagementMenu, 2000);
  });
}

async function showTransactionDetails() {
  console.clear();
  console.log('\n🔷 ====== Transaction Details ====== 🔷\n');
  
  const input = await question('Enter transaction hash or user address: ');
  let transactions = [];
  
  // البحث عن المعاملات حسب العنوان
  const userData = savjeeCoin.userData.getUserData(input);
  if (userData) {
    // تحويل المعاملات إلى كائنات Transaction
    transactions = userData.transactions.map(tx => Transaction.fromJSON(tx));
    console.log(`\n📋 Transactions for user: ${input}`);
  } else {
    // البحث عن معاملة محددة
    const tx = savjeeCoin.getTransactionByHash(input);
    if (tx) {
      transactions = [Transaction.fromJSON(tx)];
      console.log(`\n📋 Transaction: ${input}`);
    } else {
      console.log('❌ No transactions found!');
      await question('\nPress Enter to return to menu...');
      return;
    }
  }
  
  // عرض تفاصيل المعاملات
  transactions.forEach((tx, index) => {
    console.log(`\nTransaction #${index + 1}:`);
    console.log('========================================');
    
    if (tx.fromAddress === null) {
      console.log('Type: Mining Reward');
      console.log(`Amount: +${tx.amount}`);
      console.log(`To: ${tx.toAddress}`);
      console.log(`Reason: Block mining reward`);
    } else {
      console.log(`Type: ${tx.fromAddress === input ? 'Sent' : 'Received'}`);
      console.log(`Amount: ${tx.fromAddress === input ? '-' : '+'}${tx.amount}`);
      console.log(`From: ${tx.fromAddress}`);
      console.log(`To: ${tx.toAddress}`);
      console.log(`Reason: Transfer between users`);
    }
    
    console.log(`Time: ${new Date(tx.timestamp).toLocaleString()}`);
    console.log(`Hash: ${tx.calculateHash()}`);
    console.log('========================================');
  });
  
  console.log('💸 ============================== 💸\n');
  await question('\nPress Enter to return to menu...');
}

function showUserManagementMenu() {
  console.log('\n👥 ====== User Management ====== 👥');
  console.log('1. List All Users');
  console.log('2. Add Existing User');
  console.log('3. View User Details');
  console.log('4. View User Tokens');
  console.log('5. Back to Main Menu');
  console.log('👥 ========================== 👥\n');

  rl.question('Select an option (1-5): ', (option) => {
    switch (option) {
      case '1':
        listAllUsers();
        break;
      case '2':
        addExistingUser();
        break;
      case '3':
        showUserDetails();
        break;
      case '4':
        viewUserTokens();
        break;
      case '5':
        main();
        break;
      default:
        console.log('Invalid option!');
        showUserManagementMenu();
    }
  });
}

function listAllUsers() {
  console.log('\n📋 ====== All Users ====== 📋');
  const users = savjeeCoin.userData.getAllUsers();
  
  if (users.length === 0) {
    console.log('No users found!');
  } else {
    users.forEach((user, index) => {
      console.log(`\nUser #${index + 1}:`);
      console.log(`Address: ${user.address}`);
      console.log(`Balance: ${user.balance}`);
      console.log(`Total Transactions: ${user.transactions.length}`);
    });
  }
  console.log('📋 ====================== 📋\n');
  setTimeout(showUserManagementMenu, 2000);
}

function addExistingUser() {
  console.log('\n➕ ====== Add Existing User ====== ➕');
  rl.question('Enter user address (public key): ', (address) => {
    // التحقق من صحة المفتاح العام
    try {
      const ec = new EC('secp256k1');
      const key = ec.keyFromPublic(address, 'hex');
      
      // التحقق من وجود المستخدم
      if (savjeeCoin.userData.getUserData(address)) {
        console.log('❌ User already exists!');
        setTimeout(showUserManagementMenu, 2000);
        return;
      }
      
      rl.question('Enter initial balance: ', (balance) => {
        try {
          const initialBalance = parseFloat(balance);
          if (isNaN(initialBalance) || initialBalance < 0) {
            console.log('❌ Invalid balance amount!');
          } else {
            savjeeCoin.userData.createNewUser(address, initialBalance);
            console.log('✅ User added successfully!');
            console.log(`Address: ${address}`);
            console.log(`Initial Balance: ${initialBalance}`);
          }
        } catch (err) {
          console.log('❌ Error adding user:', err.message);
        }
        setTimeout(showUserManagementMenu, 2000);
      });
    } catch (err) {
      console.log('❌ Invalid public key format!');
      setTimeout(showUserManagementMenu, 2000);
    }
  });
}

async function showTransactionHistory() {
  while (true) {
    console.clear();
    console.log('\n🔷 ====== Transaction History ====== 🔷');
    console.log('1. View Transaction Details');
    console.log('2. View Recent Transactions');
    console.log('3. View Transaction Volume');
    console.log('4. View All Transactions');
    console.log('5. View Transactions by User');
    console.log('6. View Mining Rewards');
    console.log('7. View Transaction Statistics');
    console.log('0. Return to Main Menu');

    await displayUsersTable();  // عرض الجدول في كل مرة

    const choice = await question('\nEnter your choice: ');

    switch (choice) {
      case '1':
        await showTransactionDetails();
        break;
      case '2':
        await showRecentTransactions();
        break;
      case '3':
        await showTransactionVolume();
        break;
      case '4':
        await showAllTransactions();
        break;
      case '5':
        await showTransactionsByUser();
        break;
      case '6':
        await showMiningRewards();
        break;
      case '7':
        await showTransactionStats();
        break;
      case '0':
        return;
      default:
        console.log('Invalid choice!');
        await question('\nPress Enter to continue...');
    }
  }
}

async function showAllTransactions() {
  console.clear();
  console.log('\n🔷 ====== All Transactions ====== 🔷\n');
  
  const blocks = savjeeCoin.chain;
  let allTransactions = [];
  
  // جمع جميع المعاملات من جميع البلوكات
  blocks.forEach(block => {
    if (block.transactions && block.transactions.length > 0) {
      // Convert each transaction to Transaction instance if needed
      const convertedTxs = block.transactions.map(tx => 
        typeof tx === 'object' && !(tx instanceof Transaction) ? Transaction.fromJSON(tx) : tx
      );
      allTransactions = allTransactions.concat(convertedTxs);
    }
  });

  if (allTransactions.length === 0) {
    console.log('No transactions found in the blockchain!');
  } else {
    console.log(`Total Transactions: ${allTransactions.length}\n`);
    
    allTransactions.forEach((tx, index) => {
      console.log(`\nTransaction #${index + 1}:`);
      console.log('┌────────────────────┬────────────────────────────────────────────┐');
      console.log('│      Property      │                    Value                    │');
      console.log('├────────────────────┼────────────────────────────────────────────┤');
      console.log(`│ Type               │ ${(tx.fromAddress === null ? 'Mining Reward' : 'Transfer').padEnd(50)} │`);
      console.log(`│ Amount             │ ${(tx.amount || 0).toString().padEnd(50)} │`);
      console.log(`│ From               │ ${(tx.fromAddress || 'System').padEnd(50)} │`);
      console.log(`│ To                 │ ${(tx.toAddress || '').padEnd(50)} │`);
      console.log(`│ Timestamp          │ ${new Date(tx.timestamp).toLocaleString().padEnd(50)} │`);
      console.log(`│ Transaction Hash   │ ${tx.calculateHash().padEnd(50)} │`);
      console.log('└────────────────────┴────────────────────────────────────────────┘');
    });
  }

  await question('\nPress Enter to return to menu...');
}

async function showTransactionsByUser() {
  console.clear();
  console.log('\n🔷 ====== Transactions by User ====== 🔷\n');
  
  const address = await question('Enter user address: ');
  const userData = savjeeCoin.userData.getUserData(address);
  
  if (!userData) {
    console.log('User not found!');
    await question('\nPress Enter to return to menu...');
    return;
  }

  const transactions = userData.transactions;
  if (transactions.length === 0) {
    console.log('No transactions found for this user!');
  } else {
    console.log(`\nTransactions for user: ${address}`);
    console.log(`Total Transactions: ${transactions.length}\n`);
    
    transactions.forEach((tx, index) => {
      // Convert transaction to Transaction instance if needed
      const txObj = typeof tx === 'object' && !(tx instanceof Transaction) ? Transaction.fromJSON(tx) : tx;
      
      console.log(`\nTransaction #${index + 1}:`);
      console.log('┌────────────────────┬────────────────────────────────────────────┐');
      console.log('│      Property      │                    Value                    │');
      console.log('├────────────────────┼────────────────────────────────────────────┤');
      console.log(`│ Type               │ ${(txObj.fromAddress === null ? 'Mining Reward' : 'Transfer').padEnd(50)} │`);
      console.log(`│ Amount             │ ${(txObj.amount || 0).toString().padEnd(50)} │`);
      console.log(`│ From               │ ${(txObj.fromAddress || 'System').padEnd(50)} │`);
      console.log(`│ To                 │ ${(txObj.toAddress || '').padEnd(50)} │`);
      console.log(`│ Timestamp          │ ${new Date(txObj.timestamp).toLocaleString().padEnd(50)} │`);
      console.log(`│ Transaction Hash   │ ${txObj.calculateHash().padEnd(50)} │`);
      console.log('└────────────────────┴────────────────────────────────────────────┘');
    });
  }

  await question('\nPress Enter to return to menu...');
}

async function showMiningRewards() {
  console.clear();
  console.log('\n🔷 ====== Mining Rewards ====== 🔷\n');
  
  const blocks = savjeeCoin.chain;
  let miningRewards = [];
  
  // جمع جميع مكافآت التعدين
  blocks.forEach(block => {
    if (block.transactions) {
      const rewards = block.transactions.filter(tx => tx.fromAddress === null);
      miningRewards = miningRewards.concat(rewards);
    }
  });

  if (miningRewards.length === 0) {
    console.log('No mining rewards found!');
  } else {
    console.log(`Total Mining Rewards: ${miningRewards.length}\n`);
    
    miningRewards.forEach((tx, index) => {
      console.log(`\nMining Reward #${index + 1}:`);
      console.log('┌────────────────────┬────────────────────────────────────────────┐');
      console.log('│      Property      │                    Value                    │');
      console.log('├────────────────────┼────────────────────────────────────────────┤');
      console.log(`│ Amount             │ ${(tx.amount || 0).toString().padEnd(50)} │`);
      console.log(`│ Miner              │ ${(tx.toAddress || '').padEnd(50)} │`);
      console.log(`│ Timestamp          │ ${new Date(tx.timestamp).toLocaleString().padEnd(50)} │`);
      console.log(`│ Block Index        │ ${(tx.blockIndex || 'Pending').toString().padEnd(50)} │`);
      console.log(`│ Transaction Hash   │ ${tx.calculateHash().padEnd(50)} │`);
      console.log('└────────────────────┴────────────────────────────────────────────┘');
    });
  }

  await question('\nPress Enter to return to menu...');
}

async function showTransactionStats() {
  console.clear();
  console.log('\n🔷 ====== Transaction Statistics ====== 🔷\n');
  
  const blocks = savjeeCoin.chain;
  let allTransactions = [];
  let totalVolume = 0;
  let miningRewards = 0;
  let transfers = 0;
  
  // جمع إحصائيات المعاملات
  blocks.forEach(block => {
    if (block.transactions) {
      allTransactions = allTransactions.concat(block.transactions);
      block.transactions.forEach(tx => {
        totalVolume += tx.amount || 0;
        if (tx.fromAddress === null) {
          miningRewards++;
        } else {
          transfers++;
        }
      });
    }
  });

  console.log('Transaction Statistics:');
  console.log('┌────────────────────┬────────────────────────────────────────────┐');
  console.log('│      Property      │                    Value                    │');
  console.log('├────────────────────┼────────────────────────────────────────────┤');
  console.log(`│ Total Transactions │ ${allTransactions.length.toString().padEnd(50)} │`);
  console.log(`│ Total Volume       │ ${totalVolume.toString().padEnd(50)} │`);
  console.log(`│ Mining Rewards     │ ${miningRewards.toString().padEnd(50)} │`);
  console.log(`│ Transfers          │ ${transfers.toString().padEnd(50)} │`);
  console.log(`│ Average Amount     │ ${(totalVolume / allTransactions.length).toFixed(2).padEnd(50)} │`);
  console.log('└────────────────────┴────────────────────────────────────────────┘');

  await question('\nPress Enter to return to menu...');
}

async function showSystemStatistics() {
  const stats = savjeeCoin.getBlockchainStats();
  
  console.log('\n=== System Statistics ===');
  
  console.log('\n📊 Blockchain Statistics:');
  console.log(`Total Blocks: ${stats.totalBlocks}`);
  console.log(`Pending Transactions: ${stats.pendingTransactions}`);
  console.log(`Mining Difficulty: ${stats.miningDifficulty}`);
  console.log(`Mining Reward: ${stats.miningReward}`);
  console.log(`Average Block Time: ${(stats.averageBlockTime / 1000).toFixed(2)} seconds`);
  
  console.log('\n🌐 Network Statistics:');
  const networkUsers = userPorts.getAllUsers();
  console.log(`Total Nodes: ${networkUsers.length}`);
  console.log(`Active Nodes: ${networkUsers.filter(user => user.isActive).length}`);
  
  console.log('\n💸 Transaction Statistics:');
  console.log(`Total Transactions: ${stats.totalTransactions}`);
  console.log(`Transaction Volume: ${stats.transactionVolume}`);
  console.log(`Average Transactions per Block: ${(stats.totalTransactions / stats.totalBlocks).toFixed(2)}`);
  
  console.log('\n⛏️ Mining Statistics:');
  console.log('Top Miners:');
  stats.topMiners.forEach((miner, index) => {
    console.log(`${index + 1}. Address: ${miner.address}`);
    console.log(`   Blocks Mined: ${miner.blocks}`);
  });
  
  console.log('\n👥 User Statistics:');
  const users = savjeeCoin.userData.getAllUsers();
  console.log(`Total Users: ${users.length}`);
  console.log(`Active Users: ${users.filter(user => user.isActive).length}`);
  
  const totalBalance = users.reduce((sum, user) => sum + user.balance, 0);
  console.log(`Total Balance in Network: ${totalBalance}`);
  
  console.log('\n=== End of Statistics ===');
}

async function viewPendingTransactions() {
  console.log('\n=== Pending Transactions ===');
  const pendingTxs = savjeeCoin.transactionQueue;
  
  if (pendingTxs.length === 0) {
    console.log('No pending transactions found!');
  } else {
    pendingTxs.forEach((tx, index) => {
      console.log(`\nTransaction #${index + 1}:`);
      console.log('========================================');
      if (tx.fromAddress === null) {
        console.log('Type: Mining Reward');
        console.log(`Amount: ${tx.amount}`);
        console.log(`To: ${tx.toAddress}`);
      } else {
        console.log(`Type: Transfer`);
        console.log(`Amount: ${tx.amount}`);
        console.log(`From: ${tx.fromAddress}`);
        console.log(`To: ${tx.toAddress}`);
      }
      console.log(`Time: ${new Date(tx.timestamp).toLocaleString()}`);
      console.log('========================================');
    });
  }

  console.log('\nOptions:');
  console.log('0. Return to menu');
  const choice = await question('Enter your choice: ');
  if (choice === '0') return;
}

async function listConnectedNodes() {
  console.clear();
  console.log('\n🔷 ====== Connected Nodes ====== 🔷\n');
  
  const networkUsers = userPorts.getAllUsers();
  if (networkUsers.length === 0) {
    console.log('No nodes connected to the network!');
  } else {
    // Table header
    console.log('┌──────────┬────────────┬────────────────────┬────────────┐');
    console.log('│   Node   │    Port    │    Public Key     │ Last Active│');
    console.log('├──────────┼────────────┼────────────────────┼────────────┤');

    // Table rows
    networkUsers.forEach(user => {
      const nodeName = user.userName.padEnd(10);
      const port = user.port.toString().padStart(10);
      const publicKey = user.publicKey.substring(0, 16) + '...';
      const lastActive = new Date(user.lastActive).toLocaleDateString().padStart(10);

      console.log(`│ ${nodeName} │ ${port} │ ${publicKey.padEnd(18)} │ ${lastActive} │`);
    });

    // Table footer
    console.log('└──────────┴────────────┴────────────────────┴────────────┘');

    // Network statistics
    console.log('\n📊 Network Statistics:');
    console.log(`Total Nodes: ${networkUsers.length}`);
    console.log(`Active Nodes: ${networkUsers.filter(user => user.isActive).length}`);
    console.log(`Network Port: ${port}`);
  }

  await question('\nPress Enter to return to menu...');
}

async function connectToNode() {
  console.clear();
  console.log('\n🔷 ====== Connect to Node ====== 🔷\n');
  
  // عرض العقد المتاحة
  const networkUsers = userPorts.getAllUsers();
  if (networkUsers.length === 0) {
    console.log('No nodes available in the network!');
    await question('\nPress Enter to return to menu...');
    return;
  }

  console.log('Available Nodes:');
  console.log('┌──────────┬────────────┬────────────────────┬────────────┐');
  console.log('│   Node   │    Port    │    Public Key     │ Last Active│');
  console.log('├──────────┼────────────┼────────────────────┼────────────┤');

  networkUsers.forEach(user => {
    const nodeName = user.userName.padEnd(10);
    const port = user.port.toString().padStart(10);
    const publicKey = user.publicKey.substring(0, 16) + '...';
    const lastActive = new Date(user.lastActive).toLocaleDateString().padStart(10);

    console.log(`│ ${nodeName} │ ${port} │ ${publicKey.padEnd(18)} │ ${lastActive} │`);
  });

  console.log('└──────────┴────────────┴────────────────────┴────────────┘');
  
  const targetPort = await question('\nEnter target node port: ');
  const targetPortNum = parseInt(targetPort);
  
  if (isNaN(targetPortNum)) {
    console.log('❌ Invalid port number!');
    await question('\nPress Enter to return to menu...');
    return;
  }

  // التحقق من أن المنفذ ليس نفس منفذ العقدة الحالية
  if (targetPortNum === port) {
    console.log('❌ Cannot connect to self!');
    await question('\nPress Enter to return to menu...');
    return;
  }

  // التحقق من وجود العقدة في القائمة
  const targetNode = networkUsers.find(user => user.port === targetPortNum);
  if (!targetNode) {
    console.log('❌ Node not found in available nodes!');
    await question('\nPress Enter to return to menu...');
    return;
  }

  try {
    // تحديث حالة العقدة في userPorts
    userPorts.addOrUpdateUser({
      userName: targetNode.userName,
      publicKey: targetNode.publicKey,
      port: targetPortNum,
      isActive: true,
      lastActive: new Date().toISOString()
    });
    
    // إرسال رسالة تأكيد الاتصال
    const message = `ALERT:Node ${userName} (${publicKey}) connected to the network`;
    await broadcast(message);
    
    console.log(`✅ Successfully connected to node ${targetNode.userName} on port ${targetPortNum}`);
    console.log('📡 Network connection established');
    console.log(`🔗 Connected to: ${targetNode.userName} (${targetNode.publicKey})`);
  } catch (err) {
    console.log(`❌ Failed to connect to node: ${err.message}`);
    // تحديث حالة العقدة في حالة الفشل
    userPorts.addOrUpdateUser({
      userName: targetNode.userName,
      publicKey: targetNode.publicKey,
      port: targetPortNum,
      isActive: false,
      lastActive: new Date().toISOString()
    });
  }

  await question('\nPress Enter to return to menu...');
}

async function broadcastMessage() {
  console.clear();
  console.log('\n🔷 ====== Broadcast Message ====== 🔷\n');
  
  const message = await question('Enter message to broadcast: ');
  if (!message.trim()) {
    console.log('❌ Message cannot be empty!');
    await question('\nPress Enter to return to menu...');
    return;
  }

  try {
    await broadcast(`ALERT:${message}`);
    console.log('✅ Message broadcasted successfully!');
  } catch (err) {
    console.log(`❌ Failed to broadcast message: ${err.message}`);
  }

  await question('\nPress Enter to return to menu...');
}

async function viewNetworkStatus() {
  console.clear();
  console.log('\n🔷 ====== Network Status ====== 🔷\n');
  
  const networkUsers = userPorts.getAllUsers();
  
  // Network Overview
  console.log('📊 Network Overview:');
  console.log(`Total Nodes: ${networkUsers.length}`);
  console.log(`Active Nodes: ${networkUsers.filter(user => user.isActive).length}`);
  console.log(`Current Node Port: ${port}`);
  console.log(`Current Node Public Key: ${publicKey}`);
  
  // Node Details
  console.log('\n📋 Node Details:');
  networkUsers.forEach((user, index) => {
    console.log(`\nNode #${index + 1}:`);
    console.log(`Name: ${user.userName}`);
    console.log(`Port: ${user.port}`);
    console.log(`Public Key: ${user.publicKey}`);
    console.log(`Last Active: ${new Date(user.lastActive).toLocaleString()}`);
    console.log(`Status: ${user.isActive ? 'Active' : 'Inactive'}`);
  });

  // Network Health
  console.log('\n💓 Network Health:');
  const activeNodes = networkUsers.filter(user => user.isActive).length;
  const healthPercentage = (activeNodes / networkUsers.length) * 100;
  console.log(`Active Nodes: ${activeNodes}/${networkUsers.length} (${healthPercentage.toFixed(1)}%)`);
  console.log(`Network Status: ${healthPercentage > 50 ? 'Healthy' : 'Degraded'}`);

  await question('\nPress Enter to return to menu...');
}

async function viewLatestBlock() {
  console.clear();
  console.log('\n🔷 ====== Latest Block ====== 🔷\n');
  
  const latestBlock = savjeeCoin.getLatestBlock();
  if (!latestBlock) {
    console.log('No blocks found in the blockchain!');
    await question('\nPress Enter to return to menu...');
    return;
  }

  console.log('Block Information:');
  console.log('┌────────────────────┬────────────────────────────────────────────┐');
  console.log('│      Property      │                    Value                    │');
  console.log('├────────────────────┼────────────────────────────────────────────┤');
  console.log(`│ Index              │ ${(latestBlock.index || 0).toString().padEnd(50)} │`);
  console.log(`│ Timestamp          │ ${new Date(latestBlock.timestamp).toLocaleString().padEnd(50)} │`);
  console.log(`│ Hash               │ ${(latestBlock.hash || '').padEnd(50)} │`);
  console.log(`│ Previous Hash      │ ${(latestBlock.previousHash || '').padEnd(50)} │`);
  console.log(`│ Miner              │ ${(latestBlock.miner || 'System').padEnd(50)} │`);
  console.log(`│ Difficulty         │ ${(latestBlock.difficulty || 0).toString().padEnd(50)} │`);
  console.log(`│ Nonce              │ ${(latestBlock.nonce || 0).toString().padEnd(50)} │`);
  console.log('└────────────────────┴────────────────────────────────────────────┘');

  console.log('\nTransactions in Block:');
  if (!latestBlock.transactions || latestBlock.transactions.length === 0) {
    console.log('No transactions in this block.');
  } else {
    latestBlock.transactions.forEach((tx, index) => {
      console.log(`\nTransaction #${index + 1}:`);
      console.log('┌────────────────────┬────────────────────────────────────────────┐');
      console.log('│      Property      │                    Value                    │');
      console.log('├────────────────────┼────────────────────────────────────────────┤');
      console.log(`│ Type               │ ${tx.fromAddress === null ? 'Mining Reward'.padEnd(50) : 'Transfer'.padEnd(50)} │`);
      console.log(`│ Amount             │ ${(tx.amount || 0).toString().padEnd(50)} │`);
      console.log(`│ From               │ ${(tx.fromAddress || 'System').padEnd(50)} │`);
      console.log(`│ To                 │ ${(tx.toAddress || '').padEnd(50)} │`);
      console.log(`│ Timestamp          │ ${new Date(tx.timestamp).toLocaleString().padEnd(50)} │`);
      console.log('└────────────────────┴────────────────────────────────────────────┘');
    });
  }

  await question('\nPress Enter to return to menu...');
}

async function viewBlockByHash() {
  console.clear();
  console.log('\n🔷 ====== View Block by Hash ====== 🔷\n');
  
  const hash = await question('Enter block hash: ');
  const block = savjeeCoin.getBlockByHash(hash);
  
  if (!block) {
    console.log('Block not found!');
    await question('\nPress Enter to return to menu...');
    return;
  }

  console.log('Block Information:');
  console.log('┌────────────────────┬────────────────────────────────────────────┐');
  console.log('│      Property      │                    Value                    │');
  console.log('├────────────────────┼────────────────────────────────────────────┤');
  console.log(`│ Index              │ ${(block.index || 0).toString().padEnd(50)} │`);
  console.log(`│ Timestamp          │ ${new Date(block.timestamp).toLocaleString().padEnd(50)} │`);
  console.log(`│ Hash               │ ${(block.hash || '').padEnd(50)} │`);
  console.log(`│ Previous Hash      │ ${(block.previousHash || '').padEnd(50)} │`);
  console.log(`│ Miner              │ ${(block.miner || 'System').padEnd(50)} │`);
  console.log(`│ Difficulty         │ ${(block.difficulty || 0).toString().padEnd(50)} │`);
  console.log(`│ Nonce              │ ${(block.nonce || 0).toString().padEnd(50)} │`);
  console.log('└────────────────────┴────────────────────────────────────────────┘');

  console.log('\nTransactions in Block:');
  if (!block.transactions || block.transactions.length === 0) {
    console.log('No transactions in this block.');
  } else {
    block.transactions.forEach((tx, index) => {
      console.log(`\nTransaction #${index + 1}:`);
      console.log('┌────────────────────┬────────────────────────────────────────────┐');
      console.log('│      Property      │                    Value                    │');
      console.log('├────────────────────┼────────────────────────────────────────────┤');
      console.log(`│ Type               │ ${tx.fromAddress === null ? 'Mining Reward'.padEnd(50) : 'Transfer'.padEnd(50)} │`);
      console.log(`│ Amount             │ ${(tx.amount || 0).toString().padEnd(50)} │`);
      console.log(`│ From               │ ${(tx.fromAddress || 'System').padEnd(50)} │`);
      console.log(`│ To                 │ ${(tx.toAddress || '').padEnd(50)} │`);
      console.log(`│ Timestamp          │ ${new Date(tx.timestamp).toLocaleString().padEnd(50)} │`);
      console.log('└────────────────────┴────────────────────────────────────────────┘');
    });
  }

  await question('\nPress Enter to return to menu...');
}

async function viewBlockByIndex() {
  console.clear();
  console.log('\n🔷 ====== View Block by Index ====== 🔷\n');
  
  const index = parseInt(await question('Enter block index: '));
  if (isNaN(index)) {
    console.log('Invalid index!');
    await question('\nPress Enter to return to menu...');
    return;
  }

  const block = savjeeCoin.getBlockByIndex(index);
  if (!block) {
    console.log('Block not found!');
    await question('\nPress Enter to return to menu...');
    return;
  }

  console.log('Block Information:');
  console.log('┌────────────────────┬────────────────────────────────────────────┐');
  console.log('│      Property      │                    Value                    │');
  console.log('├────────────────────┼────────────────────────────────────────────┤');
  console.log(`│ Index              │ ${(block.index || 0).toString().padEnd(50)} │`);
  console.log(`│ Timestamp          │ ${new Date(block.timestamp).toLocaleString().padEnd(50)} │`);
  console.log(`│ Hash               │ ${(block.hash || '').padEnd(50)} │`);
  console.log(`│ Previous Hash      │ ${(block.previousHash || '').padEnd(50)} │`);
  console.log(`│ Miner              │ ${(block.miner || 'System').padEnd(50)} │`);
  console.log(`│ Difficulty         │ ${(block.difficulty || 0).toString().padEnd(50)} │`);
  console.log(`│ Nonce              │ ${(block.nonce || 0).toString().padEnd(50)} │`);
  console.log('└────────────────────┴────────────────────────────────────────────┘');

  console.log('\nTransactions in Block:');
  if (!block.transactions || block.transactions.length === 0) {
    console.log('No transactions in this block.');
  } else {
    block.transactions.forEach((tx, index) => {
      console.log(`\nTransaction #${index + 1}:`);
      console.log('┌────────────────────┬────────────────────────────────────────────┐');
      console.log('│      Property      │                    Value                    │');
      console.log('├────────────────────┼────────────────────────────────────────────┤');
      console.log(`│ Type               │ ${tx.fromAddress === null ? 'Mining Reward'.padEnd(50) : 'Transfer'.padEnd(50)} │`);
      console.log(`│ Amount             │ ${(tx.amount || 0).toString().padEnd(50)} │`);
      console.log(`│ From               │ ${(tx.fromAddress || 'System').padEnd(50)} │`);
      console.log(`│ To                 │ ${(tx.toAddress || '').padEnd(50)} │`);
      console.log(`│ Timestamp          │ ${new Date(tx.timestamp).toLocaleString().padEnd(50)} │`);
      console.log('└────────────────────┴────────────────────────────────────────────┘');
    });
  }

  await question('\nPress Enter to return to menu...');
}

async function viewTransactionByHash() {
  console.clear();
  console.log('\n🔷 ====== View Transaction by Hash ====== 🔷\n');
  
  const hash = await question('Enter transaction hash: ');
  const tx = savjeeCoin.getTransactionByHash(hash);
  
  if (!tx) {
    console.log('Transaction not found!');
    await question('\nPress Enter to return to menu...');
    return;
  }

  console.log('Transaction Information:');
  console.log('┌────────────────────┬────────────────────────────────────────────┐');
  console.log('│      Property      │                    Value                    │');
  console.log('├────────────────────┼────────────────────────────────────────────┤');
  console.log(`│ Type               │ ${tx.fromAddress === null ? 'Mining Reward'.padEnd(52) : 'Transfer'.padEnd(52)} │`);
  console.log(`│ Amount             │ ${tx.amount.toString().padEnd(52)} │`);
  console.log(`│ From               │ ${(tx.fromAddress || 'System').padEnd(52)} │`);
  console.log(`│ To                 │ ${tx.toAddress.padEnd(52)} │`);
  console.log(`│ Timestamp          │ ${new Date(tx.timestamp).toLocaleString().padEnd(52)} │`);
  console.log(`│ Hash               │ ${tx.calculateHash().padEnd(52)} │`);
  console.log('└────────────────────┴────────────────────────────────────────────┘');

  await question('\nPress Enter to return to menu...');
}

async function showUserInformation() {
  while (true) {
    console.clear();
    console.log('\n🔷 ====== User Information ====== 🔷');
    console.log('1. View User Details');
    console.log('2. View User Tokens');
    console.log('3. View All Users');
    console.log('0. Return to Main Menu');

    await displayUsersTable();  // عرض الجدول في كل مرة

    const choice = await question('\nEnter your choice: ');

    switch (choice) {
      case '1':
        await showUserDetails();
        break;
      case '2':
        await viewUserTokens();
        break;
      case '3':
        await showAllUsersTable();
        break;
      case '0':
        return;
      default:
        console.log('Invalid choice!');
        await question('\nPress Enter to continue...');
    }
  }
}

async function main() {
  while (true) {
    printMenu();
    const choice = await question('Enter your choice: ');

    switch (choice) {
      case '1':
        await showClientManagementMenu();
        break;
      case '2':
        await showMinerManagementMenu();
        break;
      case '3':
        await showTransactionManagement();
        break;
      case '4':
        await showNetworkManagement();
        break;
      case '5':
        await showBlockchainExplorer();
        break;
      case '6':
        await showSystemStatistics();
        break;
      case '7':
        console.log('Goodbye! 👋');
        rl.close();
        process.exit(0);
      default:
        console.log('Invalid choice!');
    }
  }
}

async function showRecentTransactions() {
  console.clear();
  console.log('\n🔷 ====== Recent Transactions ====== 🔷\n');
  
  const limit = parseInt(await question('Enter number of transactions to show (default: 10): ')) || 10;
  const blocks = savjeeCoin.chain;
  let allTransactions = [];
  
  // جمع جميع المعاملات من جميع البلوكات
  blocks.forEach(block => {
    if (block.transactions && block.transactions.length > 0) {
      allTransactions = allTransactions.concat(block.transactions);
    }
  });

  // ترتيب المعاملات حسب التاريخ (الأحدث أولاً)
  allTransactions.sort((a, b) => b.timestamp - a.timestamp);

  if (allTransactions.length === 0) {
    console.log('No transactions found in the blockchain!');
  } else {
    console.log(`Showing last ${Math.min(limit, allTransactions.length)} transactions:\n`);
    
    allTransactions.slice(0, limit).forEach((tx, index) => {
      console.log(`\nTransaction #${index + 1}:`);
      console.log('┌────────────────────┬────────────────────────────────────────────┐');
      console.log('│      Property      │                    Value                    │');
      console.log('├────────────────────┼────────────────────────────────────────────┤');
      console.log(`│ Type               │ ${tx.fromAddress === null ? 'Mining Reward'.padEnd(50) : 'Transfer'.padEnd(50)} │`);
      console.log(`│ Amount             │ ${(tx.amount || 0).toString().padEnd(50)} │`);
      console.log(`│ From               │ ${(tx.fromAddress || 'System').padEnd(50)} │`);
      console.log(`│ To                 │ ${(tx.toAddress || '').padEnd(50)} │`);
      console.log(`│ Timestamp          │ ${new Date(tx.timestamp).toLocaleString().padEnd(50)} │`);
      console.log(`│ Transaction Hash   │ ${tx.calculateHash().padEnd(50)} │`);
      console.log('└────────────────────┴────────────────────────────────────────────┘');
    });
  }

  await question('\nPress Enter to return to menu...');
}

async function showTransactionVolume() {
  console.clear();
  console.log('\n🔷 ====== Transaction Volume ====== 🔷\n');
  
  const blocks = savjeeCoin.chain;
  let totalVolume = 0;
  let miningRewards = 0;
  let transfers = 0;
  
  // حساب حجم المعاملات
  blocks.forEach(block => {
    if (block.transactions) {
      block.transactions.forEach(tx => {
        totalVolume += tx.amount || 0;
        if (tx.fromAddress === null) {
          miningRewards += tx.amount || 0;
        } else {
          transfers += tx.amount || 0;
        }
      });
    }
  });

  console.log('Transaction Volume Statistics:');
  console.log('┌────────────────────┬────────────────────────────────────────────┐');
  console.log('│      Property      │                    Value                    │');
  console.log('├────────────────────┼────────────────────────────────────────────┤');
  console.log(`│ Total Volume       │ ${totalVolume.toString().padEnd(50)} │`);
  console.log(`│ Mining Rewards     │ ${miningRewards.toString().padEnd(50)} │`);
  console.log(`│ Transfers          │ ${transfers.toString().padEnd(50)} │`);
  console.log(`│ Mining %           │ ${((miningRewards / totalVolume) * 100).toFixed(2).padEnd(50)}% │`);
  console.log(`│ Transfers %        │ ${((transfers / totalVolume) * 100).toFixed(2).padEnd(50)}% │`);
  console.log('└────────────────────┴────────────────────────────────────────────┘');

  await question('\nPress Enter to return to menu...');
}

// إضافة خيار الرسائل في القائمة الرئيسية
async function showMainMenu() {
    console.clear();
    console.log('=== Main Menu ===');
    console.log('1. Wallet Management');
    console.log('2. Transaction Management');
    console.log('3. Transaction History');
    console.log('4. Blockchain Explorer');
    console.log('5. Smart Contract Management');
    console.log('6. User Name Management');
    console.log('7. Messaging System');
    console.log('8. Future Improvements');
    console.log('0. Exit');

    const choice = await question('\nSelect an option: ');

    switch (choice) {
        case '1':
            await showWalletManagement();
            break;
        case '2':
            await showTransactionManagement();
            break;
        case '3':
            await showTransactionHistory();
            break;
        case '4':
            await showBlockchainExplorer();
            break;
        case '5':
            await showSmartContractManagement();
            break;
        case '6':
            await showDNSManagement();
            break;
        case '7':
            await showMessagingMenu();
            break;
        case '8':
            await showFutureImprovements();
            break;
        case '0':
            process.exit(0);
        default:
            console.log('Invalid option!');
            await new Promise(resolve => setTimeout(resolve, 1000));
            await showMainMenu();
    }
}

// قائمة الرسائل
async function showMessagingMenu() {
    console.clear();
    console.log('=== قائمة الرسائل ===');
    console.log('1. عرض الرسائل الواردة');
    console.log('2. إرسال رسالة جديدة');
    console.log('3. البحث في الرسائل');
    console.log('0. العودة للقائمة الرئيسية');

    const choice = await question('\nاختر رقم العملية: ');

    switch (choice) {
        case '1':
            await showInbox();
            break;
        case '2':
            await sendNewMessage();
            break;
        case '3':
            await searchMessages();
            break;
        case '0':
            await showMainMenu();
            break;
        default:
            console.log('خيار غير صالح!');
            await new Promise(resolve => setTimeout(resolve, 1000));
            await showMessagingMenu();
    }
}

// عرض صندوق الوارد
async function showInbox() {
    console.clear();
    const currentUser = await getCurrentUser();
    if (!currentUser) {
        console.log('يجب تسجيل الدخول أولاً!');
        await new Promise(resolve => setTimeout(resolve, 2000));
        return await showMessagingMenu();
    }

    const messages = messagingSystem.getUserMessages(currentUser.publicKey);
    console.log('=== صندوق الوارد ===\n');

    if (messages.length === 0) {
        console.log('لا توجد رسائل في صندوق الوارد');
    } else {
        messages.forEach((msg, index) => {
            console.log(`${index + 1}. من: ${msg.from}`);
            console.log(`   المحتوى: ${msg.content}`);
            console.log(`   التاريخ: ${new Date(msg.timestamp).toLocaleString()}`);
            console.log(`   الحالة: ${msg.read ? 'مقروءة' : 'غير مقروءة'}`);
            console.log('-------------------');
        });
    }

    console.log('\n1. قراءة رسالة');
    console.log('2. حذف رسالة');
    console.log('0. العودة لقائمة الرسائل');

    const choice = await question('\nاختر رقم العملية: ');

    switch (choice) {
        case '1':
            const readIndex = parseInt(await question('أدخل رقم الرسالة: ')) - 1;
            if (readIndex >= 0 && readIndex < messages.length) {
                const message = messages[readIndex];
                messagingSystem.markAsRead(message.id, currentUser.publicKey);
                console.log('\n=== محتوى الرسالة ===');
                console.log(`من: ${message.from}`);
                console.log(`المحتوى: ${message.content}`);
                console.log(`التاريخ: ${new Date(message.timestamp).toLocaleString()}`);
                await question('\nاضغط Enter للعودة...');
            }
            break;
        case '2':
            const deleteIndex = parseInt(await question('أدخل رقم الرسالة: ')) - 1;
            if (deleteIndex >= 0 && deleteIndex < messages.length) {
                const message = messages[deleteIndex];
                messagingSystem.deleteMessage(message.id, currentUser.publicKey);
                console.log('تم حذف الرسالة بنجاح!');
                await new Promise(resolve => setTimeout(resolve, 1000));
            }
            break;
    }

    await showInbox();
}

// إرسال رسالة جديدة
async function sendNewMessage() {
    console.clear();
    const currentUser = await getCurrentUser();
    if (!currentUser) {
        console.log('يجب تسجيل الدخول أولاً!');
        await new Promise(resolve => setTimeout(resolve, 2000));
        return await showMessagingMenu();
    }

    console.log('=== إرسال رسالة جديدة ===\n');
    const recipient = await question('أدخل عنوان المستلم: ');
    const content = await question('أدخل محتوى الرسالة: ');

    try {
        const message = messagingSystem.sendMessage(currentUser.publicKey, recipient, content);
        console.log('\nتم إرسال الرسالة بنجاح!');
    } catch (error) {
        console.log('\nحدث خطأ أثناء إرسال الرسالة:', error.message);
    }

    await new Promise(resolve => setTimeout(resolve, 2000));
    await showMessagingMenu();
}

// البحث في الرسائل
async function searchMessages() {
    console.clear();
    const currentUser = await getCurrentUser();
    if (!currentUser) {
        console.log('يجب تسجيل الدخول أولاً!');
        await new Promise(resolve => setTimeout(resolve, 2000));
        return await showMessagingMenu();
    }

    console.log('=== البحث في الرسائل ===\n');
    const query = await question('أدخل كلمة البحث: ');

    const results = messagingSystem.searchMessages(currentUser.publicKey, query);
    console.log('\n=== نتائج البحث ===\n');

    if (results.length === 0) {
        console.log('لا توجد نتائج للبحث');
    } else {
        results.forEach((msg, index) => {
            console.log(`${index + 1}. من: ${msg.from}`);
            console.log(`   المحتوى: ${msg.content}`);
            console.log(`   التاريخ: ${new Date(msg.timestamp).toLocaleString()}`);
            console.log('-------------------');
        });
    }

    await question('\nاضغط Enter للعودة...');
    await showMessagingMenu();
}

// Add Future Improvements menu to main menu
async function showFutureImprovements() {
    while (true) {
        console.clear();
        console.log('\n=== Future Improvements ===\n');
        console.log('1. Variable Reward System');
        console.log('2. Security Enhancements');
        console.log('3. User Interface Improvements');
        console.log('4. Network Features');
        console.log('5. Smart Contract System');
        console.log('6. Performance Optimizations');
        console.log('7. User Features');
        console.log('8. Reporting and Analytics');
        console.log('9. Documentation System');
        console.log('10. Development Tools');
        console.log('0. Return to Main Menu');

        const choice = await question('\nSelect an option: ');

        switch (choice) {
            case '1':
                await showVariableRewardSystem();
                break;
            case '2':
                await showSecurityEnhancements();
                break;
            case '3':
                await showUIImprovements();
                break;
            case '4':
                await showNetworkFeatures();
                break;
            case '5':
                await showSmartContractSystem();
                break;
            case '6':
                await showPerformanceOptimizations();
                break;
            case '7':
                await showUserFeatures();
                break;
            case '8':
                await showReportingAndAnalytics();
                break;
            case '9':
                await showDocumentationSystem();
                break;
            case '10':
                await showDevelopmentTools();
                break;
            case '0':
                return;
            default:
                console.log('Invalid option!');
                await new Promise(resolve => setTimeout(resolve, 1000));
        }
    }
}

async function showVariableRewardSystem() {
    console.clear();
    console.log('\n=== Variable Reward System ===\n');
    console.log('1. Dynamic Mining Rewards');
    console.log('   - Adjust rewards based on network difficulty');
    console.log('   - Implement bonus rewards for active miners');
    console.log('   - Create a points system for mining contributions');
    
    console.log('\n2. Transaction Fee System');
    console.log('   - Implement dynamic transaction fees');
    console.log('   - Priority processing for higher fees');
    console.log('   - Fee distribution to miners');
    
    console.log('\n3. Incentive Programs');
    console.log('   - Long-term mining incentives');
    console.log('   - Network participation rewards');
    console.log('   - Community contribution bonuses');

    await question('\nPress Enter to return to menu...');
}

async function showSecurityEnhancements() {
    console.clear();
    console.log('\n=== Security Enhancements ===\n');
    console.log('1. Key Management');
    console.log('   - Encrypted private key storage');
    console.log('   - Multi-signature support');
    console.log('   - Hardware wallet integration');
    
    console.log('\n2. Network Security');
    console.log('   - Enhanced node validation');
    console.log('   - DDoS protection');
    console.log('   - Network encryption');
    
    console.log('\n3. Transaction Security');
    console.log('   - Advanced transaction verification');
    console.log('   - Fraud detection system');
    console.log('   - Transaction monitoring');

    await question('\nPress Enter to return to menu...');
}

async function showUIImprovements() {
    console.clear();
    console.log('\n=== User Interface Improvements ===\n');
    console.log('1. Graphical User Interface');
    console.log('   - Electron-based desktop application');
    console.log('   - Real-time blockchain visualization');
    console.log('   - Interactive transaction explorer');
    
    console.log('\n2. Mobile Application');
    console.log('   - iOS and Android support');
    console.log('   - Push notifications');
    console.log('   - Mobile wallet features');
    
    console.log('\n3. Web Interface');
    console.log('   - Web-based wallet');
    console.log('   - Blockchain explorer');
    console.log('   - Network statistics dashboard');

    await question('\nPress Enter to return to menu...');
}

async function showNetworkFeatures() {
    console.clear();
    console.log('\n=== Network Features ===\n');
    console.log('1. Node Management');
    console.log('   - Automatic node discovery');
    console.log('   - Node health monitoring');
    console.log('   - Network topology visualization');
    
    console.log('\n2. Synchronization');
    console.log('   - Fast sync protocol');
    console.log('   - State synchronization');
    console.log('   - Network state verification');
    
    console.log('\n3. Communication');
    console.log('   - P2P messaging system');
    console.log('   - Network-wide announcements');
    console.log('   - Node status broadcasting');

    await question('\nPress Enter to return to menu...');
}

async function showSmartContractSystem() {
    console.clear();
    console.log('\n=== Smart Contract System ===\n');
    console.log('1. Contract Development');
    console.log('   - Smart contract language');
    console.log('   - Development environment');
    console.log('   - Testing framework');
    
    console.log('\n2. Contract Management');
    console.log('   - Contract deployment system');
    console.log('   - Contract versioning');
    console.log('   - Contract upgrade mechanism');
    
    console.log('\n3. Contract Execution');
    console.log('   - Virtual machine for contracts');
    console.log('   - Gas optimization');
    console.log('   - Contract state management');

    await question('\nPress Enter to return to menu...');
}

async function showPerformanceOptimizations() {
    console.clear();
    console.log('\n=== Performance Optimizations ===\n');
    console.log('1. Block Processing');
    console.log('   - Parallel transaction validation');
    console.log('   - Block verification optimization');
    console.log('   - Memory usage optimization');
    
    console.log('\n2. Database Management');
    console.log('   - Efficient data storage');
    console.log('   - Caching system');
    console.log('   - Index optimization');
    
    console.log('\n3. Network Performance');
    console.log('   - Connection pooling');
    console.log('   - Request batching');
    console.log('   - Load balancing');

    await question('\nPress Enter to return to menu...');
}

async function showUserFeatures() {
    console.clear();
    console.log('\n=== User Features ===\n');
    console.log('1. Account Management');
    console.log('   - Profile customization');
    console.log('   - Activity tracking');
    console.log('   - Notification settings');
    
    console.log('\n2. Transaction Features');
    console.log('   - Scheduled transactions');
    console.log('   - Batch transactions');
    console.log('   - Transaction templates');
    
    console.log('\n3. User Tools');
    console.log('   - Portfolio management');
    console.log('   - Analytics dashboard');
    console.log('   - Export functionality');

    await question('\nPress Enter to return to menu...');
}

async function showReportingAndAnalytics() {
    console.clear();
    console.log('\n=== Reporting and Analytics ===\n');
    console.log('1. Network Analytics');
    console.log('   - Network health metrics');
    console.log('   - Performance analytics');
    console.log('   - Usage statistics');
    
    console.log('\n2. User Analytics');
    console.log('   - Transaction patterns');
    console.log('   - User behavior analysis');
    console.log('   - Activity reports');
    
    console.log('\n3. System Reports');
    console.log('   - Automated reporting');
    console.log('   - Custom report generation');
    console.log('   - Data visualization');

    await question('\nPress Enter to return to menu...');
}

async function showDocumentationSystem() {
    console.clear();
    console.log('\n=== Documentation System ===\n');
    console.log('1. User Documentation');
    console.log('   - User guides');
    console.log('   - Feature documentation');
    console.log('   - FAQ system');
    
    console.log('\n2. Developer Documentation');
    console.log('   - API documentation');
    console.log('   - Integration guides');
    console.log('   - Code examples');
    
    console.log('\n3. System Documentation');
    console.log('   - Architecture overview');
    console.log('   - Deployment guides');
    console.log('   - Maintenance procedures');

    await question('\nPress Enter to return to menu...');
}

async function showDevelopmentTools() {
    console.clear();
    console.log('\n=== Development Tools ===\n');
    console.log('1. Testing Tools');
    console.log('   - Unit testing framework');
    console.log('   - Integration testing');
    console.log('   - Performance testing');
    
    console.log('\n2. Development Environment');
    console.log('   - Local development setup');
    console.log('   - Debug tools');
    console.log('   - Code analysis tools');
    
    console.log('\n3. Deployment Tools');
    console.log('   - Automated deployment');
    console.log('   - Environment management');
    console.log('   - Monitoring tools');

    await question('\nPress Enter to return to menu...');
}

async function showMinerManagementMenu() {
    while (true) {
        console.clear();
        console.log('\n🔷 ====== Miner Management ====== 🔷');
        console.log('1. Create New Miner');
        console.log('2. View All Miners');
        console.log('3. Assign Miner to Client');
        console.log('4. Unassign Miner');
        console.log('5. View Miner Statistics');
        console.log('0. Return to Main Menu');

        await displayMinersTable();  // Display current miners

        const choice = await question('\nEnter your choice: ');

        switch (choice) {
            case '1':
                await createNewMiner();
                break;
            case '2':
                await viewAllMiners();
                break;
            case '3':
                await assignMinerToClient();
                break;
            case '4':
                await unassignMiner();
                break;
            case '5':
                await viewMinerStatistics();
                break;
            case '0':
                return;
            default:
                console.log('Invalid choice!');
                await question('\nPress Enter to continue...');
        }
    }
}

async function displayMinersTable() {
    console.log('\n📊 Active Miners:');
    console.log('┌──────────┬────────────────────────────────────────────────────┬────────────┬────────────┬────────────┬────────────┐');
    console.log('│ Miner ID │                     Address                        │  Balance   │ Blocks Mined│Total Mined │Client Addr │');
    console.log('├──────────┼────────────────────────────────────────────────────┼────────────┼────────────┼────────────┼────────────┤');

    const miners = minerManager.loadMiners();
    miners.forEach(miner => {
        const minerId = miner.id.toString().padEnd(10);
        const address = miner.address.substring(0, 48).padEnd(48);
        const balance = (miner.balance || 0).toString().padStart(10);
        const blocksMined = (miner.stats.blocksMined || 0).toString().padStart(10);
        const totalMined = (miner.stats.totalMined || 0).toString().padStart(10);
        const clientAddr = (miner.clientAddress ? miner.clientAddress.substring(0, 10) + '...' : 'Unassigned').padStart(10);

        console.log(`│${minerId}│${address}│${balance}│${blocksMined}│${totalMined}│${clientAddr}│`);
    });

    console.log('└──────────┴────────────────────────────────────────────────────┴────────────┴────────────┴────────────┴────────────┘\n');
}

async function createNewMiner() {
    console.clear();
    console.log('\n🔷 ====== Create New Miner ====== 🔷\n');

    const minerId = await question('Enter miner ID: ');
    if (!minerId.trim()) {
        console.log('❌ Miner ID cannot be empty!');
        await question('\nPress Enter to continue...');
        return;
    }

    try {
        const miner = minerManager.createMiner(minerId);
        console.log('\n✅ Miner created successfully!');
        console.log(`Miner ID: ${miner.id}`);
        console.log(`Address: ${miner.address}`);
        console.log(`Status: ${miner.status}`);
        console.log('\n⚠️ Important: Save the private key securely!');
        console.log(`Private Key: ${miner.privateKey}`);
    } catch (error) {
        console.log(`\n❌ Error creating miner: ${error.message}`);
    }

    await question('\nPress Enter to continue...');
}

async function viewAllMiners() {
    console.clear();
    console.log('\n🔷 ====== All Miners ====== 🔷\n');

    const miners = minerManager.loadMiners();
    if (miners.length === 0) {
        console.log('No miners found!');
    } else {
        miners.forEach((miner, index) => {
            console.log(`\nMiner #${index + 1}:`);
            console.log('┌────────────────────┬────────────────────────────────────────────┐');
            console.log('│      Property      │                    Value                    │');
            console.log('├────────────────────┼────────────────────────────────────────────┤');
            console.log(`│ ID                 │ ${miner.id.padEnd(50)} │`);
            console.log(`│ Address            │ ${miner.address.padEnd(50)} │`);
            console.log(`│ Status             │ ${miner.status.padEnd(50)} │`);
            console.log(`│ Balance            │ ${(miner.balance || 0).toString().padEnd(50)} │`);
            console.log(`│ Client Address     │ ${(miner.clientAddress || 'Unassigned').padEnd(50)} │`);
            console.log(`│ Blocks Mined       │ ${(miner.stats.blocksMined || 0).toString().padEnd(50)} │`);
            console.log(`│ Total Mined        │ ${(miner.stats.totalMined || 0).toString().padEnd(50)} │`);
            console.log(`│ Last Active        │ ${new Date(miner.lastActive).toLocaleString().padEnd(50)} │`);
            console.log('└────────────────────┴────────────────────────────────────────────┘');
        });
    }

    await question('\nPress Enter to continue...');
}

async function assignMinerToClient() {
    console.clear();
    console.log('\n🔷 ====== Assign Miner to Client ====== 🔷\n');

    const miners = minerManager.getAvailableMiners();
    if (miners.length === 0) {
        console.log('No available miners found!');
        await question('\nPress Enter to continue...');
        return;
    }

    console.log('Available Miners:');
    miners.forEach((miner, index) => {
        console.log(`${index + 1}. Miner ID: ${miner.id}`);
        console.log(`   Address: ${miner.address}`);
        console.log(`   Status: ${miner.status}`);
        console.log('-------------------');
    });

    const minerChoice = parseInt(await question('\nSelect miner number: ')) - 1;
    if (minerChoice < 0 || minerChoice >= miners.length) {
        console.log('❌ Invalid selection!');
        await question('\nPress Enter to continue...');
        return;
    }

    const clientAddress = await question('Enter client address: ');
    if (!clientAddress.trim()) {
        console.log('❌ Client address cannot be empty!');
        await question('\nPress Enter to continue...');
        return;
    }

    try {
        const success = minerManager.assignMinerToClient(miners[minerChoice].id, clientAddress);
        if (success) {
            console.log('\n✅ Miner assigned successfully!');
        } else {
            console.log('\n❌ Failed to assign miner!');
        }
    } catch (error) {
        console.log(`\n❌ Error: ${error.message}`);
    }

    await question('\nPress Enter to continue...');
}

async function unassignMiner() {
    console.clear();
    console.log('\n🔷 ====== Unassign Miner ====== 🔷\n');

    const assignedMiners = minerManager.getAssignedMiners();
    if (assignedMiners.length === 0) {
        console.log('No assigned miners found!');
        await question('\nPress Enter to continue...');
        return;
    }

    console.log('Assigned Miners:');
    assignedMiners.forEach((miner, index) => {
        console.log(`${index + 1}. Miner ID: ${miner.id}`);
        console.log(`   Address: ${miner.address}`);
        console.log(`   Client: ${miner.clientAddress}`);
        console.log('-------------------');
    });

    const choice = parseInt(await question('\nSelect miner number to unassign: ')) - 1;
    if (choice < 0 || choice >= assignedMiners.length) {
        console.log('❌ Invalid selection!');
        await question('\nPress Enter to continue...');
        return;
    }

    try {
        const success = minerManager.unassignMiner(assignedMiners[choice].id);
        if (success) {
            console.log('\n✅ Miner unassigned successfully!');
        } else {
            console.log('\n❌ Failed to unassign miner!');
        }
    } catch (error) {
        console.log(`\n❌ Error: ${error.message}`);
    }

    await question('\nPress Enter to continue...');
}

async function viewMinerStatistics() {
    console.clear();
    console.log('\n🔷 ====== Miner Statistics ====== 🔷\n');

    const miners = minerManager.loadMiners();
    if (miners.length === 0) {
        console.log('No miners found!');
        await question('\nPress Enter to continue...');
        return;
    }

    // Overall Statistics
    const totalBlocksMined = miners.reduce((sum, miner) => sum + (miner.stats.blocksMined || 0), 0);
    const totalRewards = miners.reduce((sum, miner) => sum + (miner.stats.totalMined || 0), 0);
    const activeMiners = miners.filter(m => new Date(m.lastActive) > new Date(Date.now() - 3600000)).length;

    console.log('📊 Overall Mining Statistics:');
    console.log('┌────────────────────┬────────────────────────────────────────────┐');
    console.log('│      Metric        │                    Value                    │');
    console.log('├────────────────────┼────────────────────────────────────────────┤');
    console.log(`│ Total Miners       │ ${miners.length.toString().padEnd(50)} │`);
    console.log(`│ Active Miners      │ ${activeMiners.toString().padEnd(50)} │`);
    console.log(`│ Total Blocks Mined │ ${totalBlocksMined.toString().padEnd(50)} │`);
    console.log(`│ Total Rewards      │ ${totalRewards.toString().padEnd(50)} │`);
    console.log('└────────────────────┴────────────────────────────────────────────┘');

    // Individual Miner Statistics
    console.log('\n📈 Individual Miner Performance:');
    miners.forEach((miner, index) => {
        console.log(`\nMiner #${index + 1}:`);
        console.log('┌────────────────────┬────────────────────────────────────────────┐');
        console.log('│      Metric        │                    Value                    │');
        console.log('├────────────────────┼────────────────────────────────────────────┤');
        console.log(`│ Miner ID           │ ${miner.id.padEnd(50)} │`);
        console.log(`│ Status             │ ${miner.status.padEnd(50)} │`);
        console.log(`│ Blocks Mined       │ ${(miner.stats.blocksMined || 0).toString().padEnd(50)} │`);
        console.log(`│ Total Mined        │ ${(miner.stats.totalMined || 0).toString().padEnd(50)} │`);
        console.log(`│ Current Balance    │ ${(miner.balance || 0).toString().padEnd(50)} │`);
        console.log(`│ Mining Efficiency  │ ${(miner.stats.efficiency || 100).toString().padEnd(50)} │`);
        console.log(`│ Last Active        │ ${new Date(miner.lastActive).toLocaleString().padEnd(50)} │`);
        console.log('└────────────────────┴────────────────────────────────────────────┘');
    });

    await question('\nPress Enter to continue...');
}

// Start the CLI
main().catch(console.error);

async function showClientManagementMenu() {
    while (true) {
        console.clear();
        console.log('\n🔷 ====== Client Management ====== 🔷');
        console.log('1. Create New Client');
        console.log('2. View All Clients');
        console.log('3. View Client Details');
        console.log('4. Update Client');
        console.log('5. Delete Client');
        console.log('0. Return to Main Menu');

        await displayClientsTable();  // Display current clients

        const choice = await question('\nEnter your choice: ');

        switch (choice) {
            case '1':
                await createNewClient();
                break;
            case '2':
                await viewAllClients();
                break;
            case '3':
                await viewClientDetails();
                break;
            case '4':
                await updateClient();
                break;
            case '5':
                await deleteClient();
                break;
            case '0':
                return;
            default:
                console.log('Invalid choice!');
                await question('\nPress Enter to continue...');
        }
    }
}

async function displayClientsTable() {
    console.log('\n📊 Active Clients:');
    console.log('┌────────────────────────────────────────────────────┬────────────┬────────────┬────────────┬────────────┬────────────┐');
    console.log('│                     Address                        │  Balance   │  Sent Tx   │  Recv Tx   │  Mined Tx  │ Last Active│');
    console.log('├────────────────────────────────────────────────────┼────────────┼────────────┼────────────┼────────────┼────────────┤');

    const clients = clientManager.getAllClients();
    clients.forEach(client => {
        const address = client.address.substring(0, 48).padEnd(48);
        const balance = client.balance.toString().padStart(10);
        const sentTxs = client.transactions.filter(tx => tx.fromAddress === client.address).length.toString().padStart(10);
        const receivedTxs = client.transactions.filter(tx => tx.toAddress === client.address && tx.fromAddress !== null).length.toString().padStart(10);
        const minedTxs = client.transactions.filter(tx => tx.fromAddress === null).length.toString().padStart(10);
        const lastActive = new Date(client.lastActive).toLocaleString().padStart(10);

        console.log(`│${address}│${balance}│${sentTxs}│${receivedTxs}│${minedTxs}│${lastActive}│`);
    });

    console.log('└────────────────────────────────────────────────────┴────────────┴────────────┴────────────┴────────────┴────────────┘\n');
}

async function createNewClient() {
    console.log('\n🔷 ====== Create New Client ====== 🔷\n');
    
    const clientId = await question('Enter client ID: ');
    const initialBalance = parseFloat(await question('Enter initial balance (0 if none): ')) || 0;

    try {
        const client = clientManager.createClient(clientId);
        if (initialBalance > 0) {
            clientManager.updateClientBalance(client.address, initialBalance);
        }
        console.log('\n✅ Client created successfully!');
        console.log(`Client ID: ${client.clientId}`);
        console.log(`Address: ${client.address}`);
        console.log(`Initial Balance: ${initialBalance}`);
    } catch (error) {
        console.log('\n❌ Error creating client:', error.message);
    }
}

async function viewAllClients() {
    console.clear();
    console.log('\n🔷 ====== All Clients ====== 🔷\n');

    const clients = clientManager.getAllClients();
    if (clients.length === 0) {
        console.log('No clients found!');
    } else {
        clients.forEach((client, index) => {
            console.log(`\nClient #${index + 1}:`);
            console.log('┌────────────────────┬────────────────────────────────────────────┐');
            console.log('│      Property      │                    Value                    │');
            console.log('├────────────────────┼────────────────────────────────────────────┤');
            console.log(`│ Client ID          │ ${client.clientId.padEnd(50)} │`);
            console.log(`│ Address            │ ${client.address.padEnd(50)} │`);
            console.log(`│ Balance            │ ${client.balance.toString().padEnd(50)} │`);
            console.log(`│ Total Sent         │ ${client.stats.totalSent.toString().padEnd(50)} │`);
            console.log(`│ Total Received     │ ${client.stats.totalReceived.toString().padEnd(50)} │`);
            console.log(`│ Total Mined        │ ${client.stats.totalMined.toString().padEnd(50)} │`);
            console.log(`│ Blocks Mined       │ ${client.stats.blocksMined.toString().padEnd(50)} │`);
            console.log(`│ Created At         │ ${new Date(client.createdAt).toLocaleString().padEnd(50)} │`);
            console.log(`│ Last Active        │ ${new Date(client.lastActive).toLocaleString().padEnd(50)} │`);
            console.log('└────────────────────┴────────────────────────────────────────────┘');
        });
    }

    await question('\nPress Enter to continue...');
}

async function viewClientDetails() {
    console.clear();
    console.log('\n🔷 ====== View Client Details ====== 🔷\n');

    const address = await question('Enter client address: ');
    const client = clientManager.getClient(address);

    if (!client) {
        console.log('❌ Client not found!');
        await question('\nPress Enter to continue...');
        return;
    }

    console.log('\nClient Information:');
    console.log('┌────────────────────┬────────────────────────────────────────────┐');
    console.log('│      Property      │                    Value                    │');
    console.log('├────────────────────┼────────────────────────────────────────────┤');
    console.log(`│ Client ID          │ ${client.clientId.padEnd(50)} │`);
    console.log(`│ Address            │ ${client.address.padEnd(50)} │`);
    console.log(`│ Balance            │ ${client.balance.toString().padEnd(50)} │`);
    console.log(`│ Created At         │ ${new Date(client.createdAt).toLocaleString().padEnd(50)} │`);
    console.log(`│ Last Active        │ ${new Date(client.lastActive).toLocaleString().padEnd(50)} │`);
    console.log('└────────────────────┴────────────────────────────────────────────┘');

    console.log('\nTransaction Statistics:');
    console.log('┌────────────────────┬────────────────────────────────────────────┐');
    console.log('│      Metric        │                    Value                    │');
    console.log('├────────────────────┼────────────────────────────────────────────┤');
    console.log(`│ Total Sent         │ ${client.stats.totalSent.toString().padEnd(50)} │`);
    console.log(`│ Total Received     │ ${client.stats.totalReceived.toString().padEnd(50)} │`);
    console.log(`│ Total Mined        │ ${client.stats.totalMined.toString().padEnd(50)} │`);
    console.log(`│ Blocks Mined       │ ${client.stats.blocksMined.toString().padEnd(50)} │`);
    console.log('└────────────────────┴────────────────────────────────────────────┘');

    if (client.transactions.length > 0) {
        console.log('\nRecent Transactions:');
        const recentTxs = client.transactions.slice(-5).reverse();
        recentTxs.forEach((tx, index) => {
            console.log(`\nTransaction #${index + 1}:`);
            console.log('┌────────────────────┬────────────────────────────────────────────┐');
            console.log('│      Property      │                    Value                    │');
            console.log('├────────────────────┼────────────────────────────────────────────┤');
            console.log(`│ Type               │ ${(tx.fromAddress === null ? 'Mining Reward' : tx.fromAddress === client.address ? 'Sent' : 'Received').padEnd(50)} │`);
            console.log(`│ Amount             │ ${tx.amount.toString().padEnd(50)} │`);
            console.log(`│ From               │ ${(tx.fromAddress || 'Mining Reward').padEnd(50)} │`);
            console.log(`│ To                 │ ${tx.toAddress.padEnd(50)} │`);
            console.log(`│ Timestamp          │ ${new Date(tx.timestamp).toLocaleString().padEnd(50)} │`);
            console.log('└────────────────────┴────────────────────────────────────────────┘');
        });
    }

    await question('\nPress Enter to continue...');
}

async function updateClient() {
    console.clear();
    console.log('\n🔷 ====== Update Client ====== 🔷\n');

    const address = await question('Enter client address: ');
    const client = clientManager.getClient(address);

    if (!client) {
        console.log('❌ Client not found!');
        await question('\nPress Enter to continue...');
        return;
    }

    console.log('\nCurrent Client Information:');
    console.log(`Client ID: ${client.clientId}`);
    console.log(`Balance: ${client.balance}`);

    console.log('\nWhat would you like to update?');
    console.log('1. Client ID');
    console.log('2. Balance');
    console.log('0. Cancel');

    const choice = await question('\nEnter your choice: ');

    try {
        switch (choice) {
            case '1':
                const newClientId = await question('Enter new client ID: ');
                if (newClientId.trim()) {
                    client.clientId = newClientId;
                    console.log('✅ Client ID updated successfully!');
                }
                break;
            case '2':
                const newBalance = parseFloat(await question('Enter new balance: '));
                if (!isNaN(newBalance) && newBalance >= 0) {
                    client.balance = newBalance;
                    console.log('✅ Balance updated successfully!');
                } else {
                    console.log('❌ Invalid balance amount!');
                }
                break;
            case '0':
                return;
            default:
                console.log('❌ Invalid choice!');
        }

        client.lastActive = new Date().toISOString();
        clientManager.updateClient(client);

    } catch (error) {
        console.log(`\n❌ Error updating client: ${error.message}`);
    }

    await question('\nPress Enter to continue...');
}

async function deleteClient() {
    console.clear();
    console.log('\n🔷 ====== Delete Client ====== 🔷\n');

    const address = await question('Enter client address: ');
    const client = clientManager.getClient(address);

    if (!client) {
        console.log('❌ Client not found!');
        await question('\nPress Enter to continue...');
        return;
    }

    console.log('\nClient Information:');
    console.log(`Client ID: ${client.clientId}`);
    console.log(`Address: ${client.address}`);
    console.log(`Balance: ${client.balance}`);

    const confirm = await question('\nAre you sure you want to delete this client? (yes/no): ');

    if (confirm.toLowerCase() === 'yes') {
        try {
            clientManager.deleteClient(address);
            console.log('\n✅ Client deleted successfully!');

            // Also delete the key file if it exists
            const keysDir = path.join(__dirname, '..', 'keys');
            const keyPath = path.join(keysDir, `${client.clientId}.key.json`);
            if (fs.existsSync(keyPath)) {
                fs.unlinkSync(keyPath);
                console.log('✅ Key file deleted successfully!');
            }
        } catch (error) {
            console.log(`\n❌ Error deleting client: ${error.message}`);
        }
    } else {
        console.log('\nDeletion cancelled.');
    }

    await question('\nPress Enter to continue...');
}

module.exports = {
    main,
    showMainMenu,
    showWalletManagement,
    showTransactionManagement,
    showNetworkManagement,
    showBlockchainExplorer,
    showMessagingMenu,
    showMinerManagementMenu,
    showClientManagementMenu
};
