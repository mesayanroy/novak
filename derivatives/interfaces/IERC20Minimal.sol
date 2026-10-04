// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @notice The subset of ERC-20 the derivatives package needs for collateral
///         (USDG on Robinhood Chain, MockUSDG on testnet).
interface IERC20Minimal {
    function transfer(address to, uint256 amount) external returns (bool);
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
    function approve(address spender, uint256 amount) external returns (bool);
    function balanceOf(address account) external view returns (uint256);
    function decimals() external view returns (uint8);
}
