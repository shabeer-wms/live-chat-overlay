// Sources: connect YouTube and Facebook.
import { api } from '../api.js'
import { h, guard } from '../dom.js'
import { icon, platformLogo } from '../icons.js'
import { state, subscribe } from '../state.js'
import { statusBadge, field } from '../components.js'

export default {
  title: 'Sources',
  subtitle: 'Where comments come from. Connect a live stream and its chat starts flowing in.',

  mount(root) {
    const s = state.server.sources

    // ---- YouTube ----
    const ytInput = h('input', { class: 'input', placeholder: 'https://www.youtube.com/watch?v=…  or the 11-character video ID', value: s.youtube.input })
    const ytStatus = h('span'), ytMsg = h('div', { class: 'help' })
    const yt = h('section', { class: 'card' },
      h('div', { class: 'card-head' }, platformLogo('youtube'), h('h2', null, 'YouTube'), h('div', { class: 'right' }, ytStatus)),
      h('div', { class: 'card-body stack' },
        field('Live video URL or ID', ytInput, 'No API key needed. The stream must be live and chat enabled.'), ytMsg,
        h('div', { class: 'row' },
          h('button', { class: 'btn primary', onclick: () => guard(() => api.post('/api/sources/connect', { source: 'youtube', input: ytInput.value }), 'Connecting to YouTube…') }, 'Save & connect'),
          h('button', { class: 'btn', onclick: () => guard(() => api.post('/api/sources/disconnect', { source: 'youtube' })) }, 'Disconnect'))))

    // ---- Facebook ----
    const fbVideo = h('input', { class: 'input', placeholder: 'e.g. 1234567890123456', value: s.facebook.videoId })
    const fbToken = h('input', { class: 'input', type: 'password', autocomplete: 'off' })
    const fbStatus = h('span'), fbMsg = h('div', { class: 'help' })
    const fb = h('section', { class: 'card' },
      h('div', { class: 'card-head' }, platformLogo('facebook'), h('h2', null, 'Facebook'), h('div', { class: 'right' }, fbStatus)),
      h('div', { class: 'card-body stack' },
        field('Live video ID', fbVideo, 'The long number in the live video’s URL.'),
        field('Page access token', fbToken, 'For the Page that owns the live video. Stored on this computer only.'), fbMsg,
        h('div', { class: 'row' },
          h('button', { class: 'btn primary', onclick: async () => { await guard(() => api.post('/api/sources/connect', { source: 'facebook', videoId: fbVideo.value, token: fbToken.value }), 'Connecting to Facebook…'); fbToken.value = '' } }, 'Save & connect'),
          h('button', { class: 'btn', onclick: () => guard(() => api.post('/api/sources/disconnect', { source: 'facebook' })) }, 'Disconnect')),
        h('details', { class: 'howto' }, h('summary', null, 'How do I get a token?'),
          h('ol', null,
            h('li', null, 'Open developers.facebook.com, create an app (type Business), and add the use cases “Manage everything on your Page” and “Access the Live Video API”.'),
            h('li', null, 'Open Tools → Graph API Explorer, choose your app, add the permissions pages_show_list, pages_read_engagement and pages_read_user_content, then Generate Access Token.'),
            h('li', null, 'Switch “User or Page” to your Page and copy the token. It lasts about an hour; extend it in the Access Token Debugger for a long-lived one.'),
            h('li', null, 'You do not need App Review: an app in Development mode works for the Page you manage.')))))

    // statusBadge replaces itself each paint, so track the live node
    let ytNode = ytStatus, fbNode = fbStatus
    function render() {
      const src = state.server.sources
      const y = statusBadge(src.youtube.status), f = statusBadge(src.facebook.status)
      ytNode.replaceWith(y); ytNode = y
      fbNode.replaceWith(f); fbNode = f
      const yErr = src.youtube.status.startsWith('error'), fErr = src.facebook.status.startsWith('error')
      ytMsg.textContent = yErr ? src.youtube.status.slice(7) : ''
      fbMsg.textContent = fErr ? src.facebook.status.slice(7) : src.facebook.hasToken ? 'A token is saved. Leave the box empty to keep it.' : ''
      ytMsg.className = 'help' + (yErr ? ' err' : ''); fbMsg.className = 'help' + (fErr ? ' err' : '')
    }

    root.append(h('div', { class: 'grid-2' }, yt, fb))
    render()
    return subscribe(render)
  },
}
