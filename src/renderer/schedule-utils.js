// Shared by the renderer (classic script) and node tests.
(function (root) {
  function parseHttpUrl(rawUrl) {
    if (!rawUrl) return null;
    let input = String(rawUrl).trim();
    // Accept a pasted embed snippet such as YouTube's <iframe ... src="..."></iframe>
    const embedSrc = input.match(/<iframe\b[^>]*?\ssrc\s*=\s*(?:"([^"]+)"|'([^']+)')/i);
    if (embedSrc) input = (embedSrc[1] || embedSrc[2]).replace(/&amp;/g, '&');
    if (input.startsWith('//')) input = 'https:' + input;
    if (!/^https?:\/\//i.test(input)) {
      if (/^[a-z][a-z0-9+.-]*:/i.test(input)) return null;
      input = 'https://' + input;
    }

    try {
      return new URL(input);
    } catch (e) {
      return null;
    }
  }

  const getYouTubeVideoId = (parsed) => {
    const host = parsed.hostname.toLowerCase().replace(/^(www|m)\./, '');
    let id = '';
    if (host === 'youtu.be') id = parsed.pathname.split('/')[1] || '';
    else if (host === 'youtube.com' || host === 'youtube-nocookie.com') {
      const parts = parsed.pathname.split('/').filter(Boolean);
      if (parts[0] === 'watch') id = parsed.searchParams.get('v') || '';
      else if (['embed', 'shorts', 'live', 'v'].includes(parts[0])) id = parts[1] || '';
    }
    return /^[a-z0-9_-]{6,20}$/i.test(id) ? id : '';
  };

  // Returns an embeddable http(s) URL, or '' if the input is not a web URL.
  // Full youtube.com watch page for a YouTube link, or '' for anything else.
  function getYouTubeWatchUrl(rawUrl) {
    const parsed = parseHttpUrl(rawUrl);
    const videoId = parsed ? getYouTubeVideoId(parsed) : '';
    if (!videoId) return '';
    const watch = new URL('https://www.youtube.com/watch');
    watch.searchParams.set('v', videoId);
    const start = parseInt(parsed.searchParams.get('t') || parsed.searchParams.get('start'), 10);
    if (start > 0) watch.searchParams.set('t', String(start));
    return watch.href;
  }

  function formatPresentationUrl(rawUrl, options = {}) {
    const parsed = parseHttpUrl(rawUrl);
    if (!parsed) return '';
    if (options.youtubeWatchPage) {
      const watchUrl = getYouTubeWatchUrl(rawUrl);
      if (watchUrl) return watchUrl;
    }

    const host = parsed.hostname.toLowerCase();

    if (host === 'docs.google.com' && parsed.pathname.startsWith('/presentation/')) {
      const base = parsed.origin + parsed.pathname.replace(/\/(edit|pub|preview|embed).*$/, '');
      return base + '/embed?start=false&loop=false&delayms=3000';
    }

    const videoId = getYouTubeVideoId(parsed);
    if (videoId) {
      const embed = new URL('https://www.youtube.com/embed/' + videoId);
      embed.searchParams.set('rel', '0');
      embed.searchParams.set('controls', '1');
      embed.searchParams.set('fs', '1');
      const list = parsed.searchParams.get('list');
      if (list && /^[a-z0-9_-]+$/i.test(list)) embed.searchParams.set('list', list);
      const start = parseInt(parsed.searchParams.get('t') || parsed.searchParams.get('start'), 10);
      if (start > 0) embed.searchParams.set('start', String(start));
      const end = parseInt(parsed.searchParams.get('end'), 10);
      if (end > 0) embed.searchParams.set('end', String(end));
      return embed.href;
    }

    if ((host === 'canva.com' || host.endsWith('.canva.com')) && parsed.pathname.startsWith('/design')) {
      const path = parsed.pathname.replace(/\/(edit|view|watch)\/?$/, '/view');
      return parsed.origin + path + '?embed';
    }

    return parsed.href;
  }

  // Drive file links are always treated as audio and never shown in the Drive viewer.
  function getAudioStreamUrl(rawUrl, audioProxyBase) {
    const parsed = parseHttpUrl(rawUrl);
    if (!parsed) return '';

    if (/\.(mp3|wav|ogg|m4a|flac)$/i.test(parsed.pathname)) return parsed.href;
    if (parsed.hostname.toLowerCase() !== 'drive.google.com') return '';
    if (!audioProxyBase) return '';

    const pathId = parsed.pathname.match(/\/(?:file\/)?d\/([a-z0-9_-]+)/i);
    const fileId = (pathId && pathId[1]) || parsed.searchParams.get('id');
    if (!fileId || !/^[a-z0-9_-]+$/i.test(fileId)) return '';

    const streamUrl = new URL(audioProxyBase + '/' + fileId);
    // Older shared files require their resource key or Drive redirects to sign-in.
    const resourceKey = parsed.searchParams.get('resourcekey');
    if (resourceKey && /^[a-z0-9_-]+$/i.test(resourceKey)) streamUrl.searchParams.set('resourcekey', resourceKey);
    return streamUrl.href;
  }

  const api = { formatPresentationUrl, getAudioStreamUrl, getYouTubeWatchUrl };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.ScheduleUtils = api;
})(typeof window !== 'undefined' ? window : globalThis);
