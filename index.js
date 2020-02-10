// Install Queue Base
const childProcess = require('child_process')
const axios = require('axios')
const cheerio = require('cheerio')
const Queue = require('bull')

// Install Arena Base
const Arena = require('bull-arena')
const express = require('express')
const arena = Arena({
  queues: [
    {
      name: 'MediaReader',
      hostId: 'Live-CatchAll',
      type: 'bull',
      url: process.env.REDIS_URL
    },
    {
      name: 'StatusFetch',
      hostId: 'Live-CatchAll',
      type: 'bull',
      url: process.env.REDIS_URL
    }
  ]
})

const router = express.Router()
router.use('/', arena)

// Config
const MediaReader = new Queue('MediaReader', process.env.REDIS_URL)
const StatusFetch = new Queue('StatusFetch', process.env.REDIS_URL)

const ffmpegPath = process.env.FFMPEG_PATH || 'ffmpeg'
const fileSaveDir = process.env.VIDEO_DIR || process.cwd()

const config = require('./config.json');

// Main
(async () => {
  StatusFetch.add('StatusFetch', config, {
    repeat: {
      every: 15 * 1000
    }
  })
})()

StatusFetch.process('StatusFetch', (job) => {
  return new Promise((resolve, reject) => {
    MediaReader.getActive().then((value) => {
      var previousJobs = []
      value.forEach(job => {
        previousJobs.push(job.data.url.split('/')[4])
      })

      job.log('Start Fetch Stream')
      const N = job.data.Chaturbate.length
      var i = 0
      var requests = []
      for (const user of job.data.Chaturbate) {
        chaturbate(user).then((metadata) => {
          if (metadata.hls_source !== '') {
            const request = {
              filename: metadata.broadcaster_username + ' - ' + (new Date()).getTime() + '.ts',
              url: metadata.hls_source
            }
            job.log('Stream detected : ' + metadata.broadcaster_username + ' (Chaturbate)')
            if (previousJobs.indexOf(request.url.split('/')[4]) > -1) {
              job.log('Registed yet cancelled.')
            } else {
              requests.push(request)
              MediaReader.add(metadata.broadcaster_username + ' (Chaturbate)', request)
            }
          }
          i++
          job.progress(Math.floor(i / N * 100))
          if (i === N) {
            job.log('Finitshed Fetch Stream')
            resolve(requests)
          }
        })
      }
    })
  })
})

MediaReader.process('*', 32, (job, done) => {
  job.log('Start Reading : ' + job.data.filename)
  const ffProc = childProcess.spawn(ffmpegPath, [
    '-loglevel', '24', '-i', job.data.url, '-movflags', 'faststart', '-c', 'copy', '-y', fileSaveDir + require('path').sep + job.data.filename
  ])
  ffProc.stdout.on('data', (data) => {
    job.log(data.toString())
  })
  ffProc.stderr.on('data', (data) => {
    job.log(data.toString())
  })
  ffProc.stderr.on('close', (code) => {
    if (code === 0) {
      done('Finished Reading : ' + job.data.filename)
    } else {
      done(new Error('Exit ffmpeg with error'))
    }
  })
})

async function chaturbate (username) {
  var metadata

  const userInfo = `https://chaturbate.com/${username}/`
  const res = await axios.get(userInfo)
  const $ = cheerio.load(res.data)
  $('script').map((i, foo) => {
    foo.children.forEach(bar => {
      if (bar.type === 'text' && bar.data.indexOf('window.initialRoomDossier') > -1) {
        bar.data.split('\n').forEach(prop => {
          if (prop.indexOf('window.initialRoomDossier') > -1) {
            const initialRoomDossier = prop.match('window.initialRoomDossier = (.*);$')[1]
            metadata = JSON.parse(JSON.parse(initialRoomDossier))
          }
        })
      }
    })
  })
  return metadata
}
