// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title MockUSDG
/// @notice TESTNET-ONLY stand-in for USDG (Global Dollar), the stablecoin
///         Robinhood Chain's bridge routes deliver. Mainnet USDG
///         (`0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168`, 6 decimals) has no
///         canonical deployment on Robinhood Chain testnet (46630), so the
///         demo deploys this instead. Anyone may `mint` up to `MAX_MINT` per
///         call — it is a faucet, not money. Never deploy to mainnet.
contract MockUSDG {
    string public constant name = "Mock USDG (Novak testnet)";
    string public constant symbol = "USDG";
    uint8 public constant decimals = 6;
    uint256 public constant MAX_MINT = 10_000e6;

    uint256 public totalSupply;
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    event Transfer(address indexed from, address indexed to, uint256 value);
    event Approval(address indexed owner, address indexed spender, uint256 value);

    function mint(address to, uint256 amount) external {
        require(amount <= MAX_MINT, "MockUSDG: mint cap");
        totalSupply += amount;
        balanceOf[to] += amount;
        emit Transfer(address(0), to, amount);
    }

    function approve(address spender, uint256 amount) external returns (bool) {
        allowance[msg.sender][spender] = amount;
        emit Approval(msg.sender, spender, amount);
        return true;
    }

    function transfer(address to, uint256 amount) external returns (bool) {
        _transfer(msg.sender, to, amount);
        return true;
    }

    function transferFrom(address from, address to, uint256 amount) external returns (bool) {
        uint256 allowed = allowance[from][msg.sender];
        if (allowed != type(uint256).max) {
            require(allowed >= amount, "MockUSDG: allowance");
            allowance[from][msg.sender] = allowed - amount;
        }
        _transfer(from, to, amount);
        return true;
    }

    function _transfer(address from, address to, uint256 amount) private {
        require(balanceOf[from] >= amount, "MockUSDG: balance");
        balanceOf[from] -= amount;
        balanceOf[to] += amount;
        emit Transfer(from, to, amount);
    }
}
