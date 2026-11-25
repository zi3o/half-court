const FILES = {
  bounce: '/audio/bounce.wav',
  swish: '/audio/swish.wav',
  squeak: '/audio/squeak.wav',
}

export function createSounds() {
  const Context = window.AudioContext || window.webkitAudioContext
  const context = new Context()
  const buffers = {}
  let loading = null

  function load() {
    if (loading) return loading
    loading = Promise.all(Object.entries(FILES).map(async ([name, url]) => {
      const response = await fetch(url)
      const data = await response.arrayBuffer()
      buffers[name] = await context.decodeAudioData(data)
    }))
    return loading
  }

  function unlock() {
    if (context.state === 'suspended') context.resume()
    load()
  }

  function play(cue) {
    const buffer = buffers[cue.name]
    if (!buffer || context.state !== 'running') return
    const source = context.createBufferSource()
    source.buffer = buffer
    source.playbackRate.value = cue.rate || 1
    const gain = context.createGain()
    gain.gain.value = cue.gain ?? 1
    source.connect(gain)
    gain.connect(context.destination)
    source.start()
  }

  load()
  return { play, unlock }
}
