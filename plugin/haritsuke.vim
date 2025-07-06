if exists('g:loaded_haritsuke')
  finish
endif
let g:loaded_haritsuke = 1

" Check denops.vim
if !exists('g:loaded_denops')
  echohl WarningMsg
  echom 'haritsuke.vim requires denops.vim'
  echohl None
  finish
endif

" Initialize global variables
if !exists('g:haritsuke_config')
  let g:haritsuke_config = {}
endif

" Commands
" (No commands at this time)

" <Plug> mappings
nnoremap <silent> <Plug>(haritsuke-p) <Cmd>call haritsuke#do_paste('p', 'n')<CR>
nnoremap <silent> <Plug>(haritsuke-P) <Cmd>call haritsuke#do_paste('P', 'n')<CR>
nnoremap <silent> <Plug>(haritsuke-gp) <Cmd>call haritsuke#do_paste('gp', 'n')<CR>
nnoremap <silent> <Plug>(haritsuke-gP) <Cmd>call haritsuke#do_paste('gP', 'n')<CR>
xnoremap <silent> <Plug>(haritsuke-p) <Cmd>call haritsuke#do_paste('p', 'v')<CR>
xnoremap <silent> <Plug>(haritsuke-P) <Cmd>call haritsuke#do_paste('P', 'v')<CR>
xnoremap <silent> <Plug>(haritsuke-gp) <Cmd>call haritsuke#do_paste('gp', 'v')<CR>
xnoremap <silent> <Plug>(haritsuke-gP) <Cmd>call haritsuke#do_paste('gP', 'v')<CR>
nnoremap <silent> <Plug>(haritsuke-prev) <Cmd>call haritsuke#cycle_prev()<CR>
nnoremap <silent> <Plug>(haritsuke-next) <Cmd>call haritsuke#cycle_next()<CR>

" Replace operator
nnoremap <silent> <Plug>(haritsuke-replace) <Cmd>set operatorfunc=haritsuke#replace_operator<CR>g@
xnoremap <silent> <Plug>(haritsuke-replace) :<C-u>call haritsuke#replace_operator(visualmode(1))<CR>

" Toggle smart indent
nnoremap <silent> <Plug>(haritsuke-toggle-smart-indent) <Cmd>call haritsuke#toggle_smart_indent()<CR>

" Paste without smart indent (not mapped by default)
nnoremap <silent> <Plug>(haritsuke-p-no-smart-indent) <Cmd>call haritsuke#do_paste_no_smart_indent('p', 'n')<CR>
nnoremap <silent> <Plug>(haritsuke-P-no-smart-indent) <Cmd>call haritsuke#do_paste_no_smart_indent('P', 'n')<CR>
nnoremap <silent> <Plug>(haritsuke-gp-no-smart-indent) <Cmd>call haritsuke#do_paste_no_smart_indent('gp', 'n')<CR>
nnoremap <silent> <Plug>(haritsuke-gP-no-smart-indent) <Cmd>call haritsuke#do_paste_no_smart_indent('gP', 'n')<CR>
xnoremap <silent> <Plug>(haritsuke-p-no-smart-indent) <Cmd>call haritsuke#do_paste_no_smart_indent('p', 'v')<CR>
xnoremap <silent> <Plug>(haritsuke-P-no-smart-indent) <Cmd>call haritsuke#do_paste_no_smart_indent('P', 'v')<CR>
xnoremap <silent> <Plug>(haritsuke-gp-no-smart-indent) <Cmd>call haritsuke#do_paste_no_smart_indent('gp', 'v')<CR>
xnoremap <silent> <Plug>(haritsuke-gP-no-smart-indent) <Cmd>call haritsuke#do_paste_no_smart_indent('gP', 'v')<CR>

" Highlight group
highlight default link HaritsukeRegion IncSearch

" Initialize denops plugin on startup if denops is ready
augroup HaritsukeInit
  autocmd!
  autocmd User DenopsPluginPost:haritsuke call haritsuke#request('initialize', g:haritsuke_config)
augroup END
