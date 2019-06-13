const axios = require('axios');
const logger = require('./logger');

const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const TRELLO_KEY = process.env.TRELLO_KEY;
const TRELLO_TOKEN = process.env.TRELLO_TOKEN;
const TRELLO_AUTH_STRING = `key=${TRELLO_KEY}&token=${TRELLO_TOKEN}`;

const cardListIdMap = {
  PR: process.env.PRLISTID,
  Merge: process.env.MERGELISTID,
};

const gitInstance = axios.create({
  baseURL: 'https://api.github.com/repos/',
  headers: {'Authorization': `Bearer ${GITHUB_TOKEN}`}
});

const trelloInstance = axios.create({
  baseURL: 'https://api.trello.com/1/',
  headers: {}
});

const addTrelloAttachment = (cardId, githubURL) => {
  try {
    logger.log('info', 'attaching file...');
    const response = trelloInstance.post(`cards/${cardId}/attachments?${TRELLO_AUTH_STRING}`, {url: githubURL});
    if(!response || !response.data) return;
    logger.log('info', 'attachment added');
  } catch (error) {
    logger.log('error', error);
    return null;
  }
};

const moveCard = async (cardId, operation) => {
  const operationListId = cardListIdMap[operation];
  try {
    logger.log('info', 'moving file...');
    const response = await trelloInstance.put(`cards/${cardId}/idList?value=${operationListId}&${TRELLO_AUTH_STRING}`)
    if(!response || !response.data) return;
    logger.log('info', 'card moved!');
  } catch (error) {
    logger.log('error', error);
    return null;
  }
};

const getGitAPILink = link => {
  const splitLink = link.split('/');
  const org = splitLink[3];
  const repo = splitLink[4];
  const num = splitLink[6];
  return `/${org}/${repo}/pulls/${num}`;
};

const getTrelloLink = body => {
  const bodyArr = body.trim().split(/\s+/);
  let link = '';
  bodyArr.some(word => {
    if(word.indexOf('trello.com/c') > -1) {
      link = word;
      return true;
    }
    return false;
  });
  return link;
};

const getTrelloCardId = body => {
  const link = getTrelloLink(body);
  if(!link) return;
  const linkArr = link.split('/');
  // Card id is the string after /c/ in the url
  const cIndx = linkArr.indexOf('c');
  return linkArr[cIndx + 1];
};

const getPRDetails = async(url) => {
  try {
    logger.log('info', 'getting PR details..');
    const response = await gitInstance.get(url);
    if(!response || !response.data || !response.data.body) return;
    const body = response.data.body;
    logger.log('info', 'gotten PR details');
    const trelloCardId = getTrelloCardId(body);
    return trelloCardId;
  } catch (error) {
    logger.log('error', error);
    return null;
  }
}

const handleOperation = async (operation, githubLink) => {
  const gitAPILink = getGitAPILink(githubLink);
  const trelloCardId = await getPRDetails(gitAPILink);
  if(!trelloCardId) return;

  switch (operation) {
    case 'PR':
      await Promise.all([
        addTrelloAttachment(trelloCardId, githubLink),
        moveCard(trelloCardId, operation)
      ]);
      break;

    case 'Merge':
      await moveCard(trelloCardId, operation);
      break;

    default:
      break;
  }
};

const getOperation = pretext => {
  if(pretext.indexOf('Pull request merged by') > -1) {
    return 'Merge';
  } else if(pretext.indexOf('Pull request opened by') > -1) {
    return 'PR';
  }
};

const handler = (req, res) => {
  try {
    if(!req.body.event || !req.body.event.attachments || !req.body.event.attachments.length)
      return res.status(200).json({ok:true});
    const pretext = req.body.event.attachments[0].pretext;
    if(!pretext) return res.status(200).json({ok:true});;
    const operation = getOperation(pretext);
    const githubLink = req.body.event.attachments[0].title_link;
    if(!githubLink) return res.status(200).json({ok:true});
    // slack expects a response within 3 seconds,
    // otherwise it retries automatically
    res.status(200).end(async () => {
      await handleOperation(operation, githubLink);
    });
  } catch (error) {
    logger.log('error', error);
    res.status(200).json({ok:true});
  }
};

module.exports = handler;