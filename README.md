# haritsuke.vim

Advanced yank history manager with cycling support for Vim/Neovim powered by denops.vim.

## Features

- **Persistent yank history**: Saves yank history to disk and restores it across Vim sessions
- **Paste cycling**: After pasting, use `Ctrl-n`/`Ctrl-p` to cycle through yank history
- **Replace operator**: Replace text with yanked content using operators
- **Multi-register support**: Track history for multiple registers
- **Smart highlighting**: Visual feedback during paste cycling
- **Database-backed storage**: Efficient storage with SQLite
- **Smart indentation**: Automatically adjusts indentation when pasting line-wise content

## Requirements

- Vim 9.0+ or Neovim 0.8.0+
- [denops.vim](https://github.com/vim-denops/denops.vim)
- Deno 1.37.0+

## Installation

Using [vim-plug](https://github.com/junegunn/vim-plug):

```vim
Plug 'vim-denops/denops.vim'
Plug 'yuki-yano/haritsuke.vim'
```

Using [lazy.nvim](https://github.com/folke/lazy.nvim):

```lua
{
  'yuki-yano/haritsuke.vim',
  dependencies = { 'vim-denops/denops.vim' }
}
```

## Usage

### Basic mappings

Using Vim script:

```vim
" Enhanced paste commands with history cycling
nmap p <Plug>(haritsuke-p)
nmap P <Plug>(haritsuke-P)
nmap gp <Plug>(haritsuke-gp)
nmap gP <Plug>(haritsuke-gP)
xmap p <Plug>(haritsuke-p)
xmap P <Plug>(haritsuke-P)
xmap gp <Plug>(haritsuke-gp)
xmap gP <Plug>(haritsuke-gP)

" Cycle through yank history after pasting
nmap <C-n> <Plug>(haritsuke-next)
nmap <C-p> <Plug>(haritsuke-prev)

" Replace operator
nmap gr <Plug>(haritsuke-replace)
xmap gr <Plug>(haritsuke-replace)

" Toggle smart indent while cycling (optional)
nmap <C-i> <Plug>(haritsuke-toggle-smart-indent)
```

Using Neovim Lua:

```lua
-- Enhanced paste commands with history cycling
vim.keymap.set({'n', 'x'}, 'p', '<Plug>(haritsuke-p)')
vim.keymap.set({'n', 'x'}, 'P', '<Plug>(haritsuke-P)')
vim.keymap.set({'n', 'x'}, 'gp', '<Plug>(haritsuke-gp)')
vim.keymap.set({'n', 'x'}, 'gP', '<Plug>(haritsuke-gP)')

-- Cycle through yank history after pasting
vim.keymap.set('n', '<C-n>', '<Plug>(haritsuke-next)')
vim.keymap.set('n', '<C-p>', '<Plug>(haritsuke-prev)')

-- Replace operator
vim.keymap.set({'n', 'x'}, 'gr', '<Plug>(haritsuke-replace)')

-- Toggle smart indent while cycling (optional)
vim.keymap.set('n', '<C-i>', '<Plug>(haritsuke-toggle-smart-indent)')
```

### How it works

1. **Yank history tracking**: All yank operations are automatically recorded
2. **Enhanced paste**: Use your regular paste commands with added history support
3. **History cycling**: After pasting, press `<C-n>`/`<C-p>` to cycle through previous yanks
4. **Replace operator**: Use `gr{motion}` to replace text with register content (e.g., `griw` to replace inner word)

### Example workflow

```vim
" 1. Yank some text
yiw     " Yank inner word
yy      " Yank line
yi"     " Yank inside quotes

" 2. Paste as usual
p       " Paste after cursor

" 3. Cycle through history
<C-p>   " Replace with previous yank
<C-p>   " Go further back in history
<C-n>   " Go forward in history

" 4. Use replace operator
griw    " Replace inner word with register content
grG     " Replace from cursor to end of file

" 5. Check if cycling is active
:echo haritsuke#is_active()  " Returns 1 during cycling, 0 otherwise
```

## Configuration

Configure haritsuke.vim by setting `g:haritsuke_config`:

Using Vim script:

```vim
let g:haritsuke_config = {
  \ 'persist_path': '',         " Database directory (default: stdpath('data')/haritsuke)
  \ 'max_entries': 100,         " Maximum number of history entries
  \ 'max_data_size': 1048576,   " Maximum size per entry in bytes (1MB)
  \ 'register_keys': 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789"-=.:%/#*+~_',
  \ 'debug': v:false,           " Enable debug logging
  \ 'use_region_hl': v:true,    " Enable highlight during paste cycling
  \ 'region_hl_groupname': 'HaritsukeRegion',  " Highlight group name
  \ 'smart_indent': v:true      " Enable smart indentation adjustment
  \ }
```

Using Neovim Lua:

```lua
vim.g.haritsuke_config = {
  persist_path = '',         -- Database directory (default: stdpath('data')/haritsuke)
  max_entries = 100,         -- Maximum number of history entries
  max_data_size = 1048576,   -- Maximum size per entry in bytes (1MB)
  register_keys = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789"-=.:%/#*+~_',
  debug = false,             -- Enable debug logging
  use_region_hl = true,      -- Enable highlight during paste cycling
  region_hl_groupname = 'HaritsukeRegion',  -- Highlight group name
  smart_indent = true        -- Enable smart indentation adjustment
}
```

### Configuration options

- **persist_path**: Directory path where the SQLite database file will be stored. If empty, uses the default location (`~/.local/share/nvim/haritsuke/` for Neovim or `~/.vim/haritsuke/` for Vim)
- **max_entries**: Maximum number of yank entries to keep in history (default: 100)
- **max_data_size**: Maximum size in bytes for a single yank entry (default: 1048576 = 1MB)
- **register_keys**: Registers to track for history (default: all alphanumeric and special registers)
- **debug**: Enable debug logging for troubleshooting (default: false)
- **use_region_hl**: Show visual highlight of pasted region during cycling (default: true)
- **region_hl_groupname**: Vim highlight group for paste region highlighting (default: 'HaritsukeRegion')
- **smart_indent**: Enable smart indentation adjustment for line-wise paste operations. Automatically adjusts pasted lines to match current context (default: true)

### Highlight customization

Customize the paste region highlight:

```vim
highlight HaritsukeRegion guibg=#3e4452 ctermbg=238
```

## Advanced features

### Paste without smart indent

If you need to paste with original indentation preserved, you can use the special mappings:

Using Vim script:

```vim
" Use <Leader>p for paste without smart indent
nmap <Leader>p <Plug>(haritsuke-p-no-smart-indent)
nmap <Leader>P <Plug>(haritsuke-P-no-smart-indent)
nmap <Leader>gp <Plug>(haritsuke-gp-no-smart-indent)
nmap <Leader>gP <Plug>(haritsuke-gP-no-smart-indent)
xmap <Leader>p <Plug>(haritsuke-p-no-smart-indent)
xmap <Leader>P <Plug>(haritsuke-P-no-smart-indent)
xmap <Leader>gp <Plug>(haritsuke-gp-no-smart-indent)
xmap <Leader>gP <Plug>(haritsuke-gP-no-smart-indent)
```

Using Neovim Lua:

```lua
-- Use <Leader>p for paste without smart indent
vim.keymap.set({'n', 'x'}, '<Leader>p', '<Plug>(haritsuke-p-no-smart-indent)')
vim.keymap.set({'n', 'x'}, '<Leader>P', '<Plug>(haritsuke-P-no-smart-indent)')
vim.keymap.set({'n', 'x'}, '<Leader>gp', '<Plug>(haritsuke-gp-no-smart-indent)')
vim.keymap.set({'n', 'x'}, '<Leader>gP', '<Plug>(haritsuke-gP-no-smart-indent)')
```

These mappings temporarily disable smart indentation for the paste operation.

### Multi-register support

haritsuke.vim tracks history for multiple registers independently:

```vim
"ayiw   " Yank to register 'a'
"byy    " Yank to register 'b'
"ap     " Paste from register 'a' with history
"bp     " Paste from register 'b' with history
```

### Visual mode support

All features work in visual mode:

```vim
" Select text, then:
p       " Replace selection with yanked text
<C-n>   " Cycle to next item in history
gr      " Replace with register content
```

### Programmatic usage

You can check if paste cycling is currently active:

```vim
if haritsuke#is_active()
  echo "Currently cycling through yank history"
endif
```

You can also get the current yank history as a list:

```vim
let history = haritsuke#list()
" Returns: [{'type': 'v', 'content': 'yanked text'}, ...]

" Example: Show first 5 entries
for entry in history[0:4]
  echo printf("%s: %s", entry.type, entry.content)
endfor
```

The `type` field indicates the register type:
- `v`: Characterwise yank
- `V`: Linewise yank  
- `b`: Blockwise yank

This is useful for creating custom keymaps or integrations that behave differently during paste cycling.

## Troubleshooting

### Enable debug mode

```vim
let g:haritsuke_config = { 'debug': v:true }
```

Check the debug output in `:messages`.

### Database location

By default, the yank history database is stored at:
- **Neovim**: `~/.local/share/nvim/haritsuke/history.db`
- **Vim**: `~/.vim/haritsuke/history.db`

You can customize the location by setting `persist_path` in your configuration:

```vim
let g:haritsuke_config = {
  \ 'persist_path': expand('~/my-custom-path/haritsuke')
  \ }
```

### Reset history

To clear all yank history, delete the database file:

```bash
# Default locations
rm -rf ~/.local/share/nvim/haritsuke/  # For Neovim
rm -rf ~/.vim/haritsuke/               # For Vim

# Or if you set a custom path
rm -rf ~/my-custom-path/haritsuke/
```

## License

MIT

## Credits

- Powered by [denops.vim](https://github.com/vim-denops/denops.vim)
- Name "haritsuke" (貼り付け) means "paste" in Japanese
