" Cache for config hash to detect changes
let s:last_config_hash = ''
let s:initialized = 0

function! s:get_config_hash() abort
  return string(get(g:, 'haritsuke_config', {}))
endfunction

function! s:ensure_initialized() abort
  let l:current_hash = s:get_config_hash()
  if !s:initialized || l:current_hash !=# s:last_config_hash
    " Initialize or update config
    call denops#plugin#wait('haritsuke')
    let l:result = denops#request('haritsuke', 'initialize', [g:haritsuke_config])
    let s:last_config_hash = l:current_hash
    let s:initialized = 1
  endif
endfunction

function! haritsuke#notify(funcname, ...) abort
  if !denops#plugin#is_loaded('haritsuke')
    return
  endif
  
  " Always ensure initialization (checks config changes)
  call denops#plugin#wait_async('haritsuke', 
    \ { -> s:ensure_initialized() })
  
  " Use notify for asynchronous event handling
  call denops#plugin#wait_async('haritsuke', 
    \ { -> denops#notify('haritsuke', a:funcname, a:000) })
endfunction

function! haritsuke#request(funcname, ...) abort
  call denops#plugin#wait('haritsuke')
  call s:ensure_initialized()
  return denops#request('haritsuke', a:funcname, a:000)
endfunction

function! haritsuke#do_paste(mode, vmode) abort
  call denops#plugin#wait('haritsuke')
  call s:ensure_initialized()

  let l:paste_cmd = denops#request('haritsuke', 'preparePaste', [{
    \ 'mode': a:mode,
    \ 'vmode': a:vmode,
    \ 'count': v:count1,
    \ 'register': v:register
    \ }])
  " Execute the paste command returned by denops
  if !empty(l:paste_cmd)
    execute l:paste_cmd
    " Notify denops that paste was executed
    call denops#request('haritsuke', 'onPasteExecuted', [])
  endif
endfunction

function! haritsuke#cycle_prev() abort
  call denops#plugin#wait('haritsuke')
  call s:ensure_initialized()
  call denops#request('haritsuke', 'cyclePrev', [])
endfunction

function! haritsuke#cycle_next() abort
  call denops#plugin#wait('haritsuke')
  call s:ensure_initialized()
  call denops#request('haritsuke', 'cycleNext', [])
endfunction

function! haritsuke#replace_operator(type) abort
  call denops#plugin#wait('haritsuke')
  call s:ensure_initialized()


  " Get motion type
  " Note: visualmode() returns actual character code for Ctrl-V
  let l:ctrl_v = nr2char(22)  " Ctrl-V is character 22
  let l:motion_wise = a:type ==# 'v' ? 'char' : a:type ==# 'V' ? 'line' : a:type ==# l:ctrl_v ? 'block' : a:type
  
  " Check if called from visual mode
  let l:visual_mode = (a:type ==# 'v' || a:type ==# 'V' || a:type ==# l:ctrl_v)

  " Call denops function with motion type and register
  call denops#request('haritsuke', 'doReplaceOperator', [{
    \ 'motionWise': l:motion_wise,
    \ 'register': v:register,
    \ 'visualMode': l:visual_mode
    \ }])
endfunction

function! haritsuke#is_active() abort
  if !denops#plugin#is_loaded('haritsuke')
    return 0
  endif
  
  call denops#plugin#wait('haritsuke')
  call s:ensure_initialized()
  
  try
    return denops#request('haritsuke', 'isActive', [])
  catch
    " Return false if error occurs
    return 0
  endtry
endfunction
