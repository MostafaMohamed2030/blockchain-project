# Blockchain Project

A simple blockchain implementation with client and miner management, transaction handling, and network features.

## Features

- Client Management
- Miner Management
- Transaction Management
- Network Management
- Blockchain Explorer
- Smart Contract System
- Messaging System

## Installation

1. Clone the repository:
```bash
git clone https://github.com/0xDesha/blockchain-project.git
cd blockchain-project
```

2. Install dependencies:
```bash
npm install
```

3. Start the application:
```bash
cd src
node start.js
```

## Project Structure

- `src/` - Source code directory
  - `blockchain.js` - Core blockchain implementation
  - `block.js` - Block structure and mining
  - `transaction.js` - Transaction handling
  - `clientManager.js` - Client management
  - `minerManager.js` - Miner management
  - `network.js` - Network communication
  - `cli.js` - Command line interface
  - `start.js` - Application entry point

- `keys/` - Directory for storing user keys
- `nodes/` - Directory for node configuration

## Usage

After starting the application, you can use the following commands:

1. Client Management
   - Create new client
   - View all clients
   - View client details
   - Update client
   - Delete client

2. Miner Management
   - Create new miner
   - View all miners
   - Assign miner to client
   - View miner statistics

3. Transaction Management
   - Send transactions
   - Mine pending transactions
   - View transaction history

4. Network Management
   - Connect to nodes
   - View network status
   - Broadcast messages

## License

MIT License

## Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit your changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request 
