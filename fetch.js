const axios = require('axios')
const cheerio = require('cheerio')

async function chaturbate (username) {
  var request = null

  const userInfo = `https://chaturbate.com/${username}/`
  const res = await axios.get(userInfo)
  const $ = cheerio.load(res.data)
  $('script').map((i, foo) => {
    foo.children.forEach(bar => {
      if (bar.type === 'text' && bar.data.indexOf('window.initialRoomDossier') > -1) {
        bar.data.split('\n').forEach(prop => {
          if (prop.indexOf('window.initialRoomDossier') > -1) {
            const initialRoomDossier = prop.match('window.initialRoomDossier = (.*);$')[1]
            const metadata = JSON.parse(JSON.parse(initialRoomDossier))
            if (metadata.hls_source !== '') {
              request = {
                id: metadata.hls_source.split('/')[4],
                broadcaster: metadata.broadcaster_username,
                filename: metadata.broadcaster_username + ' - ' + (new Date()).getTime() + '.ts',
                url: metadata.hls_source
              }
            }
          }
        })
      }
    })
  })
  return request
}

exports.Chaturbate = chaturbate
