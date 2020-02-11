// Install Queue Base
const childProcess = require('child_process')
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

const FETCH_FUNCTIONS = {
  Chaturbate: require('./fetch').Chaturbate
}

StatusFetch.process('StatusFetch', (job) => {
  return new Promise((resolve, reject) => {
    MediaReader.getActive().then((value) => {
      var previousJobs = []
      value.forEach(job => {
        previousJobs.push(job.data.id)
      })

      job.log('Start Fetch Stream')
      const N = job.data.Chaturbate.length
      var i = 0
      var requests = []
      for (const provider in config) {
        const users = config[provider]
        for (const user of users) {
          FETCH_FUNCTIONS[provider](user).then((request) => {
            if (request !== null) {
              job.log(`Stream detected : ${request.broadcaster} (${provider})`)
              if (previousJobs.indexOf(request.id) > -1) {
                job.log('This stream is read in other job.')
              } else {
                requests.push(request)
                MediaReader.add(`${request.broadcaster} (${provider})`, request)
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
