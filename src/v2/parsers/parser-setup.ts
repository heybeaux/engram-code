// Pre-load tree-sitter native binding before any parser spec runs.
// Prevents the require.cache clearing between spec files from
// invalidating the native binding's JS wrapper.
require('tree-sitter');
require('tree-sitter-python');
require('tree-sitter-typescript');
require('tree-sitter-go');
