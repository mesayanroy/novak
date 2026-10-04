# Vendored dependencies

`solady/FixedPointMathLib.sol` is copied **unmodified** from Solady v0.1.26
(https://github.com/Vectorized/solady/blob/v0.1.26/src/utils/FixedPointMathLib.sol,
MIT). Vendored instead of a git submodule so fresh clones and CI need no extra
`forge install`. Used by `derivatives/DistributionMarket.sol` for `expWad`/`lnWad`.
To upgrade, replace the file with a newer tagged release and re-run `forge test`.
