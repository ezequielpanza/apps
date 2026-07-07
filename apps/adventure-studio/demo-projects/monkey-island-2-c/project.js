const gameId='game-main';
const roomId='mi2c-room-007';
const gameSection=key=>`${gameId}:section:${key}`;
const roomSection=key=>`${roomId}:section:${key}`;

const roomNode={id:roomId,kind:'item',label:'Room 007',rootId:'games',gameId,sectionKey:'rooms',itemType:'room',open:true,children:[
  {id:roomSection('backgrounds'),kind:'room-section',label:'Backgrounds',sectionKey:'backgrounds',accepts:'background',icon:'▣',roomId,gameId,open:true,children:[]},
  {id:roomSection('characters'),kind:'room-section',label:'Characters',sectionKey:'characters',accepts:'character',icon:'◉',roomId,gameId,open:false,children:[]},
  {id:roomSection('objects'),kind:'room-section',label:'Objects',sectionKey:'objects',accepts:'object',icon:'□',roomId,gameId,open:false,children:[]},
  {id:roomSection('inventory'),kind:'room-section',label:'Inventory',sectionKey:'inventory',accepts:'inventory',icon:'◇',roomId,gameId,open:false,children:[]},
  {id:roomSection('audio'),kind:'room-section',label:'Audio',sectionKey:'audio',accepts:'audio',icon:'♪',roomId,gameId,open:false,children:[]},
  {id:roomSection('dialogues'),kind:'room-section',label:'Dialogues',sectionKey:'dialogues',accepts:'dialogue',icon:'◌',roomId,gameId,open:false,children:[]},
  {id:roomSection('hotspots'),kind:'room-section',label:'Hotspots',sectionKey:'hotspots',accepts:'hotspot',icon:'⌖',roomId,gameId,open:false,children:[]},
  {id:roomSection('walkAreas'),kind:'room-section',label:'Walk Areas',sectionKey:'walkAreas',accepts:'walkArea',icon:'⌁',roomId,gameId,open:false,children:[]},
  {id:roomSection('entrances'),kind:'room-section',label:'Entrances',sectionKey:'entrances',accepts:'entrance',icon:'⇥',roomId,gameId,open:false,children:[]}
]};

const project={
  id:'monkey-island-2-c',
  revision:2,
  name:'Monkey Island 2 C',
  selectedId:roomId,
  activeEditorId:roomId,
  tree:[{id:'games',kind:'root',label:'Games',itemType:'game',open:true,children:[
    {id:gameId,kind:'item',label:'Monkey Island 2 C',rootId:'games',itemType:'game',gameId,open:true,children:[
      {id:gameSection('settings'),kind:'game-section',label:'Settings',sectionKey:'settings',itemType:null,icon:'⚙',gameId,open:false},
      {id:gameSection('rooms'),kind:'game-section',label:'Rooms',sectionKey:'rooms',itemType:'room',icon:'▧',gameId,open:true,children:[roomNode]},
      {id:gameSection('characters'),kind:'game-section',label:'Characters',sectionKey:'characters',itemType:'character',icon:'◉',gameId,open:false,children:[]},
      {id:gameSection('inventory'),kind:'game-section',label:'Inventory',sectionKey:'inventory',itemType:'inventory',icon:'◇',gameId,open:false,children:[]},
      {id:gameSection('dialogues'),kind:'game-section',label:'Dialogues',sectionKey:'dialogues',itemType:'dialogue',icon:'◌',gameId,open:false,children:[]},
      {id:gameSection('audio'),kind:'game-section',label:'Audio',sectionKey:'audio',itemType:'audio',icon:'♪',gameId,open:false,children:[]}
    ]}
  ]}],
  resources:{games:{
    [gameId]:{
      id:gameId,
      type:'game',
      settings:{width:1920,height:1080},
      rooms:{
        [roomId]:{
          id:roomId,
          type:'room',
          backgrounds:[{
            id:'mi2c-room-007-bg-default',
            name:'Default',
            assetKey:'mi2c-room-007-bg-default',
            sourceUrl:'./assets/room-007.data',
            sourceEncoding:'base64',
            width:784,
            height:144,
            type:'image/webp',
            size:22182,
            scaleMode:'original',
            scale:1,
            initialX:0,
            initialY:0
          }],
          defaultBackgroundId:'mi2c-room-007-bg-default'
        }
      },
      characters:{},
      inventory:{},
      dialogues:{},
      audio:{}
    }
  }}
};

export default project;