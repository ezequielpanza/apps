const roomId='mi2c-room-007';
const section=id=>`${roomId}:section:${id}`;

const project={
  id:'monkey-island-2-c',
  name:'Monkey Island 2 C',
  settings:{width:320,height:200},
  selectedId:roomId,
  activeEditorId:roomId,
  tree:[
    {id:'rooms',kind:'root',label:'Rooms',itemType:'room',open:true,children:[
      {id:roomId,kind:'item',label:'Room 007',rootId:'rooms',itemType:'room',open:true,children:[
        {id:section('backgrounds'),kind:'room-section',label:'Backgrounds',sectionKey:'backgrounds',accepts:'background',icon:'▣',roomId,open:true,children:[]},
        {id:section('characters'),kind:'room-section',label:'Characters',sectionKey:'characters',accepts:'character',icon:'◉',roomId,open:false,children:[]},
        {id:section('objects'),kind:'room-section',label:'Objects',sectionKey:'objects',accepts:'object',icon:'□',roomId,open:false,children:[]},
        {id:section('inventory'),kind:'room-section',label:'Inventory',sectionKey:'inventory',accepts:'inventory',icon:'◇',roomId,open:false,children:[]},
        {id:section('audio'),kind:'room-section',label:'Audio',sectionKey:'audio',accepts:'audio',icon:'♪',roomId,open:false,children:[]},
        {id:section('dialogues'),kind:'room-section',label:'Dialogues',sectionKey:'dialogues',accepts:'dialogue',icon:'◌',roomId,open:false,children:[]},
        {id:section('hotspots'),kind:'room-section',label:'Hotspots',sectionKey:'hotspots',accepts:'hotspot',icon:'⌖',roomId,open:false,children:[]},
        {id:section('walkAreas'),kind:'room-section',label:'Walk Areas',sectionKey:'walkAreas',accepts:'walkArea',icon:'⌁',roomId,open:false,children:[]},
        {id:section('entrances'),kind:'room-section',label:'Entrances',sectionKey:'entrances',accepts:'entrance',icon:'⇥',roomId,open:false,children:[]}
      ]}
    ]},
    {id:'characters',kind:'root',label:'Characters',itemType:'character',open:false,children:[]},
    {id:'inventory',kind:'root',label:'Inventory',itemType:'inventory',open:false,children:[]},
    {id:'dialogues',kind:'root',label:'Dialogues',itemType:'dialogue',open:false,children:[]},
    {id:'audio',kind:'root',label:'Audio',itemType:'audio',open:false,children:[]}
  ],
  resources:{
    rooms:{
      [roomId]:{
        id:roomId,
        type:'room',
        backgrounds:[{
          id:'mi2c-room-007-bg-default',
          name:'Default',
          assetKey:'mi2c-room-007-bg-default',
          sourceUrl:'./demo-projects/monkey-island-2-c/assets/room-007.data',
          sourceEncoding:'base64',
          width:784,
          height:144,
          type:'image/png',
          size:58471,
          zoom:100,
          scaleMode:'manual'
        }],
        defaultBackgroundId:'mi2c-room-007-bg-default'
      }
    },
    characters:{},
    inventory:{},
    dialogues:{},
    audio:{}
  }
};

export default project;
