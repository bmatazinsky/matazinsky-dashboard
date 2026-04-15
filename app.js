
// ══════════════════════════════════════════════════════════════
// MATAZINSKY FAMILY DASHBOARD — Firebase Edition
// ══════════════════════════════════════════════════════════════

// ── AUTH ──────────────────────────────────────────────────────
var authenticated = false;

function checkPin() {
  var pin = document.getElementById('pin-input').value;
  if (pin === FAMILY_PIN) {
    authenticated = true;
    document.getElementById('auth-screen').style.display = 'none';
    document.getElementById('app-wrap').style.display = 'block';
    sessionStorage.setItem('mz_auth', '1');
    initApp();
  } else {
    document.getElementById('pin-input').classList.add('error');
    document.getElementById('auth-error').textContent = 'Wrong PIN — try again';
    document.getElementById('pin-input').value = '';
    setTimeout(function(){ document.getElementById('pin-input').classList.remove('error'); }, 400);
  }
}

// Auto-login if already authenticated this session
if (sessionStorage.getItem('mz_auth') === '1') {
  document.getElementById('auth-screen').style.display = 'none';
  document.getElementById('app-wrap').style.display = 'block';
  authenticated = true;
  // initApp will be called when DOM is ready
}

document.getElementById('pin-input').addEventListener('keydown', function(e) {
  if (e.key === 'Enter') checkPin();
});

// ── FIREBASE INIT ────────────────────────────────────────────
var app = firebase.initializeApp(FIREBASE_CONFIG);
var db = firebase.database();
var dbRef = db.ref('dashboard');

// ── DATA LAYER ───────────────────────────────────────────────
// Local cache — mirrors Firebase in real time
var D = {
  grocery: [],
  todo: [],
  events: [],
  notes: [],
  pets: []
};

// Helper: read from Firebase (returns cached value synchronously)
function ls(k) {
  // For dynamic keys (meals, budget, home, etc), read from cache
  if (k === 'mz2_grocery') return D.grocery;
  if (k === 'mz2_todo') return D.todo;
  if (k === 'mz2_events') return D.events;
  if (k === 'mz2_notes') return D.notes;
  if (k === 'mz2_pets') return D.pets;
  // Dynamic keys stored in Firebase under their key name
  var cached = window._fbCache && window._fbCache[k];
  return cached !== undefined ? cached : null;
}

// Helper: write to Firebase (replaces localStorage)
function ss(k, v) {
  // Update local cache immediately for responsive UI
  if (k === 'mz2_grocery') D.grocery = v;
  else if (k === 'mz2_todo') D.todo = v;
  else if (k === 'mz2_events') D.events = v;
  else if (k === 'mz2_notes') D.notes = v;
  else if (k === 'mz2_pets') D.pets = v;
  else {
    if (!window._fbCache) window._fbCache = {};
    window._fbCache[k] = v;
  }
  // Write to Firebase
  var fbKey = k.replace(/[.#$/\[\]]/g, '_');
  dbRef.child(fbKey).set(v);
}

// ── FIREBASE LISTENERS (real-time sync) ──────────────────────
var _listenersReady = 0;
var _totalListeners = 0;
window._fbCache = {};

function setupListener(fbKey, localKey, setter) {
  _totalListeners++;
  dbRef.child(fbKey).on('value', function(snap) {
    var val = snap.val();
    setter(val);
    _listenersReady++;
    if (_listenersReady >= _totalListeners && authenticated) {
      renderAll();
    }
  });
}

function setupDynamicListener(fbKey) {
  dbRef.child(fbKey).on('value', function(snap) {
    var val = snap.val();
    if (!window._fbCache) window._fbCache = {};
    window._fbCache[fbKey] = val;
    // Re-render relevant views
    if (authenticated) {
      if (fbKey.indexOf('mz2_meals') === 0) renderMeals();
      if (fbKey.indexOf('mz2_budget') === 0) renderBudget();
    }
  });
}

function renderAll() {
  try {
    renderGrocery();
    renderTodo();
    renderNotes();
    renderCal();
    renderOverview();
    updateSyncStatus(true);
  } catch(e) {
    console.error('renderAll error:', e);
  }
}

function updateSyncStatus(connected) {
  var dot = document.querySelector('.sync-dot');
  var label = document.querySelector('.sync');
  if (dot) {
    dot.classList.toggle('connected', connected);
  }
  if (label) {
    label.innerHTML = '<span class="sync-dot' + (connected ? ' connected' : '') + '"></span>' + (connected ? 'synced live' : 'connecting...');
  }
}

function initApp() {
  // Set up core listeners
  setupListener('mz2_grocery', 'grocery', function(v) { D.grocery = v || []; });
  setupListener('mz2_todo', 'todo', function(v) { D.todo = v || []; });
  setupListener('mz2_events', 'events', function(v) { D.events = v || []; });
  setupListener('mz2_notes', 'notes', function(v) { D.notes = v || []; });
  setupListener('mz2_pets', 'pets', function(v) { D.pets = v || []; });
  setupListener('mz2_home', 'home', function(v) {
    window._fbCache['mz2_home'] = v;
  });
  setupListener('mz2_recipes', 'recipes', function(v) {
    window._fbCache['mz2_recipes'] = v;
  });
  setupListener('mz2_plan', 'plan', function(v) {
    window._fbCache['mz2_plan'] = v;
  });
  setupListener('mz2_luka_events', 'luka_events', function(v) {
    window._fbCache['mz2_luka_events'] = v;
  });
  setupListener('mz2_luka_tasks', 'luka_tasks', function(v) {
    window._fbCache['mz2_luka_tasks'] = v;
  });

  // Monitor connection state
  db.ref('.info/connected').on('value', function(snap) {
    updateSyncStatus(snap.val() === true);
  });

  // Set up date display
  document.getElementById("today-label").textContent = new Date().toLocaleDateString("en-US",{weekday:"long",month:"long",day:"numeric",year:"numeric"});

  // Set up enter key handlers
  document.getElementById("grocery-input").addEventListener("keydown",function(e){if(e.key==="Enter")addGrocery();});
  document.getElementById("todo-input").addEventListener("keydown",function(e){if(e.key==="Enter")addTodo();});
  document.getElementById("note-input").addEventListener("keydown",function(e){if(e.key==="Enter")addNote();});
}

// If already authenticated (session restore), init immediately
if (authenticated) {
  initApp();
}

var TODO_CATS=["Outdoor","House","Luka","Other"];
var calYear=2026,calMonth=3,selPet=null;
var MONTHS=["January","February","March","April","May","June","July","August","September","October","November","December"];
var NAV_LABELS = {todo:"To-Do",calendar:"Calendar",grocery:"Groceries",meals:"Meal Planning",recipes:"Recipes",home:"Home Maintenance",budget:"Budget",luka:"Luka",pets:"Pet Meds",notes:"Notes"};

function toggleNavMenu(){
  var btn=document.getElementById('nav-menu-btn');
  var dd=document.getElementById('nav-dropdown');
  btn.classList.toggle('open');
  dd.classList.toggle('open');
}

function switchTab(n){
  // Close dropdown
  document.getElementById('nav-menu-btn').classList.remove('open');
  document.getElementById('nav-dropdown').classList.remove('open');

  // Update overview button highlight
  var ovBtn = document.getElementById('nav-overview-btn');
  ovBtn.classList.toggle('active', n==='overview');
  if (n==='overview') {
    document.getElementById('nav-menu-btn').style.background='#EDE5CC';
    document.getElementById('nav-menu-btn').style.color='#4A3D1A';
    document.getElementById('nav-current-label').textContent='Select section...';
  } else {
    document.getElementById('nav-menu-btn').style.background='#4A3D1A';
    document.getElementById('nav-menu-btn').style.color='#F5EFE6';
    document.getElementById('nav-current-label').textContent=NAV_LABELS[n]||n;
    document.querySelectorAll('.nav-item').forEach(function(el){
      el.classList.toggle('active', el.textContent.trim()===NAV_LABELS[n]);
    });
  }

  // Show panel
  document.querySelectorAll(".panel").forEach(function(p){p.classList.remove("active");});
  document.getElementById("panel-"+n).classList.add("active");
  if(n==="calendar")renderCal();if(n==="pets")renderPets();if(n==="overview")renderOverview();if(n==="recipes")renderRecipes();if(n==="meals")renderMeals();if(n==="home")renderHome();if(n==="budget")renderBudget();
  var conf=document.getElementById('recipe-added-confirm');if(conf&&n!=="recipes")conf.style.display='none';
}
function tagHTML(w){if(w==="b")return'<span class="tag tag-b">Brent</span>';if(w==="l")return'<span class="tag tag-l">Lauren</span>';if(w==="s")return'<span class="tag tag-s">Both</span>';return"";}
function chk(){return'<svg class="check-svg" viewBox="0 0 10 8"><polyline points="1,4 4,7 9,1"/></svg>';}

var FOOD_CATS = [
  {name:'Produce',    kw:['apple','banana','orange','grape','berry','berries','lemon','lime','avocado','tomato','lettuce','spinach','kale','salad','broccoli','carrot','celery','cucumber','pepper','onion','garlic','potato','sweet potato','mushroom','corn','zucchini','squash','herb','basil','cilantro','parsley','mint','ginger','scallion','leek','arugula','cabbage','asparagus','beet','radish','fruit','vegetable','veggie','produce']},
  {name:'Meat & seafood', kw:['chicken','beef','pork','lamb','turkey','salmon','shrimp','fish','tuna','steak','ground','sausage','bacon','ham','deli','seafood','ribs','chop','fillet','wing','breast','thigh','drumstick','crab','lobster','scallop','tilapia','cod','halibut']},
  {name:'Dairy & eggs', kw:['milk','cheese','butter','cream','yogurt','egg','eggs','cottage','sour cream','half and half','heavy','parmesan','mozzarella','cheddar','brie','feta','ricotta','cream cheese','dairy']},
  {name:'Bread & bakery', kw:['bread','bagel','muffin','roll','bun','tortilla','pita','wrap','croissant','cake','cookie','pastry','bakery','loaf','sourdough','baguette','naan']},
  {name:'Pantry & dry goods', kw:['pasta','rice','flour','sugar','salt','pepper','oil','vinegar','sauce','broth','stock','canned','bean','lentil','grain','oat','cereal','cracker','nut','seed','honey','jam','syrup','ketchup','mustard','mayo','mayonnaise','dressing','condiment','spice','seasoning','baking powder','baking soda','yeast','vanilla','extract','quinoa','couscous','noodle']},
  {name:'Frozen', kw:['frozen','ice cream','popsicle','pizza','fries','waffle']},
  {name:'Beverages', kw:['juice','water','soda','coffee','tea','wine','beer','drink','beverage','sparkling','lemonade','almond milk','oat milk']},
  {name:'Snacks', kw:['chip','pretzel','popcorn','granola','bar','snack','trail mix','jerky']},
  {name:'Household', kw:['soap','shampoo','paper','towel','toilet','detergent','cleaner','spray','foil','dish','sponge','batteries','candle','trash','garbage','tissue','napkin']}
];

function getFoodCat(text) {
  var lower = text.toLowerCase();
  for (var i = 0; i < FOOD_CATS.length; i++) {
    var cat = FOOD_CATS[i];
    for (var j = 0; j < cat.kw.length; j++) {
      if (lower.indexOf(cat.kw[j]) !== -1) return cat.name;
    }
  }
  return 'Other';
}

function sortGroceryItems(items) {
  var catOrder = FOOD_CATS.map(function(c){return c.name;}).concat(['Other']);
  var groups = {};
  catOrder.forEach(function(c){groups[c]=[];});
  items.forEach(function(item, idx) {
    var cat = getFoodCat(item.text);
    if (!groups[cat]) groups[cat] = [];
    groups[cat].push({item:item, idx:idx});
  });
  return {groups:groups, order:catOrder};
}

function renderGrocery(){
  var items = D.grocery;
  var done = items.filter(function(i){return i.done;}).length;
  document.getElementById("grocery-count").textContent = done+"/"+items.length+" done";
  var sorted = sortGroceryItems(items);
  var html = "";
  sorted.order.forEach(function(catName){
    var group = sorted.groups[catName];
    if (!group.length) return;
    html += '<div style="font-size:10px;font-weight:600;color:#8B7D50;text-transform:uppercase;letter-spacing:0.05em;padding:8px 0 4px;border-bottom:1px solid #EDE5CC;margin-bottom:2px">'+catName+'</div>';
    group.forEach(function(obj){
      var item = obj.item, idx = obj.idx;
      html += '<div class="item-row">';
      html += '<div class="item-main">';
      html += '<div class="circle '+(item.done?'done':'')+'" onclick="toggleG('+idx+')">'+chk()+'</div>';
      html += '<span class="item-text '+(item.done?'done':'')+'">'+item.text+'</span>';
      html += '<button class="del-btn" onclick="delG('+idx+')">&#215;</button>';
      html += '</div>';
      html += '<div style="margin-top:4px;margin-left:24px">';
      if (item.editingNote) {
        html += '<div style="display:flex;gap:6px;align-items:center">';
        html += '<input type="text" id="gnote-'+idx+'" value="'+(item.note||'').replace(/"/g,"&quot;")+'" placeholder="Add a note..." style="flex:1;height:26px;font-size:11px;border-radius:6px;border:1px solid #C8B88A;padding:0 8px;background:#FFFDF8;color:#2A2010" />';
        html += '<button onclick="saveGroceryNote('+idx+')" style="font-size:11px;height:26px;padding:0 8px;border-radius:6px;border:1px solid #4A3D1A;background:#4A3D1A;color:#F5EFE6;cursor:pointer">Save</button>';
        html += '<button onclick="cancelGroceryNote('+idx+')" style="font-size:11px;height:26px;padding:0 8px;border-radius:6px;border:1px solid #C8B88A;background:#F5EFE6;color:#4A3D1A;cursor:pointer">&#215;</button>';
        html += '</div>';
      } else if (item.note) {
        html += '<span class="item-note-text" style="cursor:pointer" onclick="editGroceryNote('+idx+')" title="Tap to edit">'+item.note+' <span style="color:#C8B88A;font-size:10px">&#9998;</span></span>';
      } else {
        html += '<button onclick="editGroceryNote('+idx+')" style="font-size:10px;color:#C8B88A;background:none;border:none;cursor:pointer;padding:0">+ add note</button>';
      }
      html += '</div>';
      html += '</div>';
    });
  });
  if (!html) html = '<div style="font-size:12px;color:#C8B88A;padding:8px 0">Your list is empty.</div>';
  document.getElementById("grocery-list").innerHTML = html;
}

function editGroceryNote(idx) { D.grocery[idx].editingNote=true; renderGrocery(); }
function cancelGroceryNote(idx) { D.grocery[idx].editingNote=false; renderGrocery(); }
function saveGroceryNote(idx) {
  var el=document.getElementById('gnote-'+idx);
  if(el) D.grocery[idx].note=el.value.trim();
  D.grocery[idx].editingNote=false;
  ss(KEYS.grocery,D.grocery);
  renderGrocery();
}

function toggleG(i){D.grocery[i].done=!D.grocery[i].done;ss(KEYS.grocery,D.grocery);renderGrocery();}
function delG(i){D.grocery.splice(i,1);ss(KEYS.grocery,D.grocery);renderGrocery();}
function addGrocery(){var t=document.getElementById("grocery-input").value.trim();if(!t)return;D.grocery.push({id:Date.now(),text:t,note:'',done:false,who:''});ss(KEYS.grocery,D.grocery);document.getElementById("grocery-input").value="";renderGrocery();}
function toggleBulk(){var b=document.getElementById("bulk-box");b.style.display=b.style.display==="block"?"none":"block";}
function bulkAdd(){var raw=document.getElementById("bulk-input").value,who="";raw.split("\n").forEach(function(line){var t=line.trim();if(!t)return;var parts=t.split(":"),text=parts[0].trim(),note=parts.slice(1).join(":").trim();if(text)D.grocery.push({id:Date.now()+Math.random(),text:text,note:note,done:false,who:who});});ss(KEYS.grocery,D.grocery);document.getElementById("bulk-input").value="";toggleBulk();renderGrocery();}
function renderTodo(){
  var items=D.todo,done=items.filter(function(i){return i.done;}).length;
  document.getElementById("todo-count").textContent=done+"/"+items.length+" done";
  var html="";
  TODO_CATS.forEach(function(cat){
    var ci=items.filter(function(i){return i.cat===cat;});
    if(!ci.length)return;
    html+='<div class="cat-hdr cat-hdr-'+cat+'">'+cat+'</div>';
    ci.forEach(function(item){
      var idx=items.indexOf(item);
      html+='<div class="item-row">';
      // Main row
      html+='<div class="item-main">';
      html+='<div class="circle '+(item.done?'done':'')+'" onclick="toggleT('+idx+')">'+chk()+'</div>';
      html+='<div style="display:flex;flex-direction:column;gap:1px;margin-right:2px">';
      html+='<button onclick="moveTodo('+idx+',-1)" style="font-size:9px;line-height:1;height:13px;width:16px;border:none;background:none;cursor:pointer;color:#C8B88A;padding:0" title="Move up">&#9650;</button>';
      html+='<button onclick="moveTodo('+idx+',1)" style="font-size:9px;line-height:1;height:13px;width:16px;border:none;background:none;cursor:pointer;color:#C8B88A;padding:0" title="Move down">&#9660;</button>';
      html+='</div>';
      html+='<span class="item-text '+(item.done?'done':'')+(item.urgent&&!item.done?' urgent-text':'')+'">'+item.text+'</span>';
      if(item.urgent&&!item.done)html+='<span style="font-size:10px;background:#FFEBEE;color:#8B2010;padding:2px 7px;border-radius:10px;font-weight:600;flex-shrink:0">Today!</span>';
      html+=tagHTML(item.who);
      html+='<button onclick="toggleTodoEdit('+idx+')" style="font-size:11px;font-weight:500;padding:0 10px;height:28px;border-radius:6px;border:1px solid #C8B88A;background:#F5EFE6;cursor:pointer;color:#4A3D1A;white-space:nowrap;flex-shrink:0">Edit</button>';
      html+='<button class="del-btn" onclick="delT('+idx+')">&#215;</button>';
      html+='</div>';
      // Notes preview
      if(item.note){
        html+='<div class="item-note-text">'+item.note+'</div>';
      }
      // Inline edit form
      html+='<div class="todo-edit-form" id="todo-edit-'+idx+'" style="display:none;margin-top:8px;padding:10px;background:#F5EFE6;border-radius:8px;border:1px solid #D8C8A0">';
      html+='<div style="display:flex;flex-direction:column;gap:6px">';
      html+='<div style="font-size:10px;font-weight:600;color:#8B7D50;text-transform:uppercase;letter-spacing:0.04em">Task</div>';
      html+='<input type="text" id="te-text-'+idx+'" value="'+item.text.replace(/"/g,"&quot;")+'" style="height:32px;font-size:12px;border-radius:8px;border:1px solid #C8B88A;padding:0 10px;background:#FFFDF8;color:#2A2010;width:100%" />';
      html+='<div style="display:flex;gap:8px">';
      html+='<div style="flex:1"><div style="font-size:10px;font-weight:600;color:#8B7D50;text-transform:uppercase;letter-spacing:0.04em;margin-bottom:4px">Assigned to</div>';
      html+='<select id="te-who-'+idx+'" style="height:32px;font-size:12px;border-radius:8px;border:1px solid #C8B88A;padding:0 8px;background:#FFFDF8;color:#2A2010;width:100%">';
      html+='<option value="b"'+(item.who==='b'?' selected':'')+'>Brent</option>';
      html+='<option value="l"'+(item.who==='l'?' selected':'')+'>Lauren</option>';
      html+='<option value="s"'+(item.who==='s'?' selected':'')+'>Both</option>';
      html+='</select></div>';
      html+='<div style="flex:1"><div style="font-size:10px;font-weight:600;color:#8B7D50;text-transform:uppercase;letter-spacing:0.04em;margin-bottom:4px">Category</div>';
      html+='<select id="te-cat-'+idx+'" style="height:32px;font-size:12px;border-radius:8px;border:1px solid #C8B88A;padding:0 8px;background:#FFFDF8;color:#2A2010;width:100%">';
      html+='<option value="Outdoor"'+(item.cat==='Outdoor'?' selected':'')+'>Outdoor</option>';
      html+='<option value="House"'+(item.cat==='House'?' selected':'')+'>House</option>';
      html+='<option value="Luka"'+(item.cat==='Luka'?' selected':'')+'>Luka</option>';
      html+='<option value="Other"'+(item.cat==='Other'?' selected':'')+'>Other</option>';
      html+='</select></div></div>';
      html+='<div style="font-size:10px;font-weight:600;color:#8B7D50;text-transform:uppercase;letter-spacing:0.04em">Notes</div>';
      html+='<textarea id="te-note-'+idx+'" placeholder="Add a note..." style="height:64px;font-size:12px;border-radius:8px;border:1px solid #C8B88A;padding:8px 10px;background:#FFFDF8;color:#2A2010;width:100%;resize:none;line-height:1.5">'+(item.note||'')+'</textarea>';
      html+='<div style="display:flex;align-items:center;gap:8px;padding:4px 0">'+'<input type="checkbox" id="te-urgent-'+idx+'" '+(item.urgent?'checked':'')+' style="width:16px;height:16px;cursor:pointer;accent-color:#D32F2F" />';
      html+='<label for="te-urgent-'+idx+'" style="font-size:12px;color:#8B2010;font-weight:500;cursor:pointer">Complete today — urgent</label>';
      html+='</div>';
      html+='<div style="display:flex;gap:6px">';
      html+='<button onclick="closeTodoEdit('+idx+')" style="flex:1;height:32px;font-size:12px;border-radius:8px;border:1px solid #C8B88A;background:#FFFDF8;cursor:pointer;color:#4A3D1A">Cancel</button>';
      html+='<button onclick="saveTodoEdit('+idx+')" style="flex:1;height:32px;font-size:12px;border-radius:8px;border:1px solid #4A3D1A;background:#4A3D1A;cursor:pointer;color:#F5EFE6;font-weight:500">Save</button>';
      html+='</div></div></div>';
      html+='</div>';
    });
  });
  document.getElementById("todo-list").innerHTML=html||'<div style="font-size:12px;color:#C8B88A;padding:8px 0">No tasks yet.</div>';
}


function moveTodo(idx, dir) {
  var items = D.todo;
  var cat = items[idx].cat;
  var catIdxs = [];
  items.forEach(function(it,i){ if(it.cat===cat) catIdxs.push(i); });
  var pos = catIdxs.indexOf(idx);
  var swapPos = pos + dir;
  if (swapPos < 0 || swapPos >= catIdxs.length) return;
  var swapIdx = catIdxs[swapPos];
  var tmp = items[idx]; items[idx] = items[swapIdx]; items[swapIdx] = tmp;
  ss(KEYS.todo, D.todo);
  renderTodo();
}
function openTodoEdit(idx){
  document.querySelectorAll('.todo-edit-form').forEach(function(el){el.style.display='none';});
  var el=document.getElementById('todo-edit-'+idx);
  if(el)el.style.display='block';
}
function toggleTodoEdit(idx){
  var el=document.getElementById('todo-edit-'+idx);
  if(!el)return;
  var isOpen=el.style.display==='block';
  document.querySelectorAll('.todo-edit-form').forEach(function(f){f.style.display='none';});
  if(!isOpen)el.style.display='block';
}
function closeTodoEdit(idx){
  var el=document.getElementById('todo-edit-'+idx);
  if(el)el.style.display='none';
}
function saveTodoEdit(idx){
  var text=document.getElementById('te-text-'+idx).value.trim();
  if(!text)return;
  D.todo[idx].text=text;
  D.todo[idx].who=document.getElementById('te-who-'+idx).value;
  D.todo[idx].cat=document.getElementById('te-cat-'+idx).value;
  D.todo[idx].note=document.getElementById('te-note-'+idx).value.trim();
  var uel=document.getElementById('te-urgent-'+idx);
  D.todo[idx].urgent=uel?uel.checked:false;
  ss(KEYS.todo,D.todo);
  renderTodo();
}

function toggleT(i){D.todo[i].done=!D.todo[i].done;ss(KEYS.todo,D.todo);renderTodo();}
function delT(i){D.todo.splice(i,1);ss(KEYS.todo,D.todo);renderTodo();}
function addTodo(){var t=document.getElementById("todo-input").value.trim();if(!t)return;D.todo.push({id:Date.now(),text:t,done:false,who:document.getElementById("todo-who").value,cat:document.getElementById("todo-cat").value,note:document.getElementById("todo-note-input").value.trim()});ss(KEYS.todo,D.todo);document.getElementById("todo-input").value="";document.getElementById("todo-note-input").value="";renderTodo();}
var COLOR_MAP = {
  'ev-blue':'#F57C00','ev-pink':'#E91E63','ev-green':'#1976D2',
  'ev-amber':'#D32F2F','ev-pet':'#388E3C','ev-gray':'#757575'
};
var rangeStart = null;

function renderCal(){
  document.getElementById("cal-title").textContent=MONTHS[calMonth]+" "+calYear;
  var first=new Date(calYear,calMonth,1).getDay();
  var days=new Date(calYear,calMonth+1,0).getDate();
  var today=new Date();

  // Build map of day -> array of colors
  var evDayColors={};
  D.events.forEach(function(e){
    var d=new Date(e.date+"T12:00:00");
    if(d.getFullYear()===calYear&&d.getMonth()===calMonth){
      var day=d.getDate();
      if(!evDayColors[day])evDayColors[day]=[];
      var c=COLOR_MAP[e.color]||'#8B7D50';
      if(evDayColors[day].indexOf(c)===-1)evDayColors[day].push(c);
    }
    // Handle range events
    if(e.endDate){
      var start=new Date(e.date+"T12:00:00");
      var end=new Date(e.endDate+"T12:00:00");
      var cur=new Date(start);cur.setDate(cur.getDate()+1);
      while(cur<=end){
        if(cur.getFullYear()===calYear&&cur.getMonth()===calMonth){
          var day=cur.getDate();
          if(!evDayColors[day])evDayColors[day]=[];
          var c=COLOR_MAP[e.color]||'#8B7D50';
          if(evDayColors[day].indexOf(c)===-1)evDayColors[day].push(c);
        }
        cur.setDate(cur.getDate()+1);
      }
    }
  });

  var h="";
  for(var i=0;i<first;i++)h+='<div class="cal-num cal-empty"></div>';
  for(var d=1;d<=days;d++){
    var isT=today.getFullYear()===calYear&&today.getMonth()===calMonth&&today.getDate()===d;
    var colors=evDayColors[d]||[];
    var dots=colors.map(function(c){return'<span style="display:inline-block;width:5px;height:5px;border-radius:50%;background:'+c+';margin:0 1px"></span>';}).join('');
    var dotsRow=colors.length?'<div style="display:flex;justify-content:center;gap:1px;margin-top:1px">'+dots+'</div>':'';
    h+='<div class="cal-num'+(isT?' cal-today':'')+'" onclick="calDayClick('+d+')" style="cursor:pointer;'+(rangeStart?'user-select:none':'')+'">'
      +'<div>'+d+'</div>'+dotsRow+'</div>';
  }
  document.getElementById("cal-grid").innerHTML=h;
  renderEvents();
}

var selectedCalDay = null;

function calDayClick(d){
  selectedCalDay = (selectedCalDay === d) ? null : d; // toggle off if same day clicked
  renderCalDayEvents();
  // Re-render calendar to show selected state
  document.querySelectorAll('#cal-grid .cal-num').forEach(function(el){
    el.classList.remove('cal-selected');
  });
  if(selectedCalDay){
    var cells = document.querySelectorAll('#cal-grid .cal-num:not(.cal-empty)');
    // find the cell for this day number
    cells.forEach(function(el){
      if(parseInt(el.querySelector('div').textContent)===selectedCalDay){
        el.classList.add('cal-selected');
      }
    });
  }
}

function renderCalDayEvents(){
  var container = document.getElementById('cal-day-events');
  var header = document.getElementById('cal-day-header');
  if(!selectedCalDay){
    container.style.display='none';
    return;
  }
  var date = new Date(calYear, calMonth, selectedCalDay);
  var dateStr = date.toISOString().slice(0,10);
  var dayName = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'][date.getDay()];
  var dateLabel = dayName + ', ' + date.toLocaleDateString('en-US',{month:'long',day:'numeric',year:'numeric'});

  // Find events for this day (including range events that span this date)
  var dayEvents = D.events.filter(function(e){
    var start = new Date(e.date+'T12:00:00');
    var end = e.endDate ? new Date(e.endDate+'T12:00:00') : start;
    return date >= start && date <= end;
  });

  header.textContent = dateLabel;

  var evHTML = '';
  if(!dayEvents.length){
    evHTML = '<div style="font-size:12px;color:#C8B88A;font-style:italic;padding:6px 0">Nothing scheduled</div>';
  } else {
    evHTML = dayEvents.map(function(ev){
      var startD = new Date(ev.date+'T12:00:00');
      var endD = ev.endDate ? new Date(ev.endDate+'T12:00:00') : null;
      var dateRange = startD.toLocaleDateString('en-US',{month:'short',day:'numeric'});
      if(endD && ev.endDate !== ev.date) dateRange += ' – ' + endD.toLocaleDateString('en-US',{month:'short',day:'numeric'});
      if(ev.startTime) dateRange += ' · ' + fmtTime(ev.startTime);
      if(ev.endTime) dateRange += ' – ' + fmtTime(ev.endTime);
      var borderColor = (COLOR_MAP[ev.color]||'#8B7D50');
      var timeDisplay = '';
      if (ev.startTime) {
        timeDisplay = '<div style="display:inline-flex;align-items:center;gap:4px;margin-top:5px;background:'+borderColor+';color:#fff;border-radius:20px;padding:2px 10px;font-size:11px;font-weight:600">';
        timeDisplay += fmtTime(ev.startTime);
        if (ev.endTime) timeDisplay += ' – ' + fmtTime(ev.endTime);
        timeDisplay += '</div>';
      }
      var dateDisplay = '';
      if (endD && ev.endDate !== ev.date) {
        dateDisplay = '<div style="font-size:11px;color:#8B7D50;margin-top:3px">'
          + startD.toLocaleDateString('en-US',{month:'short',day:'numeric'}) + ' – '
          + endD.toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'})
          + '</div>';
      }
      return '<div style="padding:10px 12px;margin-bottom:8px;border-left:4px solid '+borderColor+';background:#FFFDF8;border-radius:0 8px 8px 0">'
        +'<div style="font-size:14px;font-weight:600;color:#2A2010">'+ev.title+'</div>'
        +timeDisplay
        +dateDisplay
        +(ev.note?'<div style="font-size:11px;color:#A0845A;font-style:italic;margin-top:4px">'+ev.note+'</div>':'')
      +'</div>';
    }).join('');
  }

  document.getElementById('cal-day-event-list').innerHTML = evHTML;
  container.style.display = 'block';
}
function changeMonth(d){calMonth+=d;if(calMonth>11){calMonth=0;calYear++;}if(calMonth<0){calMonth=11;calYear--;}renderCal();}

function fmtTime(t) {
  if (!t) return '';
  var parts = t.split(':');
  var h = parseInt(parts[0]);
  var m = parts[1];
  var ampm = h >= 12 ? 'PM' : 'AM';
  h = h % 12 || 12;
  return h + (m !== '00' ? ':' + m : '') + ' ' + ampm;
}
function renderEvents(){
  var el=document.getElementById("event-list");
  var sorted=D.events.map(function(e,i){return Object.assign({},e,{oi:i});}).sort(function(a,b){return a.date.localeCompare(b.date);});
  if(!sorted.length){el.innerHTML='<div style="font-size:12px;color:#C8B88A;padding:8px 0">No events yet.</div>';return;}
  el.innerHTML=sorted.map(function(ev){var i=ev.oi,d=new Date(ev.date+"T12:00:00"),lbl=d.toLocaleDateString("en-US",{month:"short",day:"numeric",year:"numeric"});
    var timePart = ev.allDay ? ' · All day' : (ev.startTime ? ' · ' + fmtTime(ev.startTime) : '');
    var timeStr = timePart;
    var endDateStr = (ev.endDate && ev.endDate !== ev.date) ? ' – ' + new Date(ev.endDate+'T12:00:00').toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'}) : '';
    return'<div class="ev-chip '+ev.color+'"><div class="ev-hdr"><span style="font-weight:600">'+ev.title+'</span><div style="display:flex;gap:5px;flex-shrink:0"><button onclick="toggleEditEv('+i+')" style="font-size:12px;font-weight:500;padding:0 12px;height:34px;border-radius:8px;border:1.5px solid rgba(0,0,0,0.18);background:rgba(255,255,255,0.75);cursor:pointer;color:#2A2010">Edit</button><button onclick="delEv('+i+')" style="font-size:18px;font-weight:400;width:34px;height:34px;border-radius:8px;border:1.5px solid rgba(180,40,20,0.25);background:rgba(255,235,230,0.8);cursor:pointer;color:#8B2010;line-height:1">&#215;</button></div></div></div></div><div style="font-size:11px;opacity:0.7;margin-top:2px">'+lbl+'</div>'+(ev.note?'<div class="ev-note">'+ev.note+'</div>':"")+'<div class="ev-edit" id="ev-edit-'+i+'" style="margin-top:8px;padding:12px;background:#F9F5EE;border-radius:8px;border:1px solid #D8C8A0">'
    +'<div style="font-size:10px;font-weight:600;color:#6B5C30;text-transform:uppercase;letter-spacing:0.04em;margin-bottom:4px">Title</div>'
    +'<input type="text" id="eed-title-'+i+'" value="'+ev.title+'" style="width:100%;margin-bottom:10px;height:34px;font-size:12px;border:1px solid #C8B88A;border-radius:8px;padding:0 10px;background:#FFFDF8;color:#2A2010" />'
    +'<div style="font-size:10px;font-weight:600;color:#6B5C30;text-transform:uppercase;letter-spacing:0.04em;margin-bottom:4px">Who</div>'
    +'<select id="eed-color-'+i+'" style="width:100%;margin-bottom:10px;height:34px;font-size:12px;border:1px solid #C8B88A;border-radius:8px;padding:0 8px;background:#FFFDF8;color:#2A2010">'
    +'<option value="ev-blue"'+(ev.color==="ev-blue"?" selected":"")+'>Brent</option>'
    +'<option value="ev-pink"'+(ev.color==="ev-pink"?" selected":"")+'>Lauren</option>'
    +'<option value="ev-green"'+(ev.color==="ev-green"?" selected":"")+'>Luka</option>'
    +'<option value="ev-amber"'+(ev.color==="ev-amber"?" selected":"")+'>Family</option>'
    +'<option value="ev-pet"'+(ev.color==="ev-pet"?" selected":"")+'>Pet</option>'
    +'<option value="ev-gray"'+(ev.color==="ev-gray"?" selected":"")+'>Other</option>'
    +'</select>'
    +'<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px">'
    +'<div style="font-size:10px;font-weight:600;color:#6B5C30;text-transform:uppercase;letter-spacing:0.04em">Date &amp; time</div>'
    +'<label style="display:flex;align-items:center;gap:5px;cursor:pointer;font-size:11px;color:#4A3D1A;font-weight:500">'
    +'<input type="checkbox" id="eed-allday-'+i+'" '+(ev.allDay?'checked':'')+' onchange="toggleInlineAllDay('+i+')" style="width:14px;height:14px;accent-color:#4A3D1A;cursor:pointer" />'
    +'All day</label></div>'
    +'<div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-bottom:10px">'
    +'<div><div style="font-size:10px;color:#8B7D50;margin-bottom:3px">Start date</div>'
    +'<input type="date" id="eed-date-'+i+'" value="'+ev.date+'" style="width:100%;height:32px;font-size:11px;border:1px solid #C8B88A;border-radius:8px;padding:0 6px;background:#FFFDF8;color:#2A2010;margin-bottom:0" /></div>'
    +'<div id="eed-timefield-'+i+'" style="display:'+(ev.allDay?'none':'block')+'">'
    +'<div style="font-size:10px;color:#8B7D50;margin-bottom:3px">Start time</div>'
    +'<input type="time" id="eed-stime-'+i+'" value="'+(ev.startTime||'')+'" style="width:100%;height:32px;font-size:11px;border:1px solid #C8B88A;border-radius:8px;padding:0 6px;background:#FFFDF8;color:#2A2010;margin-bottom:0" />'
    +'</div>'
    +'<div style="grid-column:1/3"><div style="font-size:10px;color:#8B7D50;margin-bottom:3px">End date <span style="color:#C8B88A">(optional)</span></div>'
    +'<input type="date" id="eed-end-'+i+'" value="'+(ev.endDate||'')+'" style="width:100%;height:32px;font-size:11px;border:1px solid #C8B88A;border-radius:8px;padding:0 6px;background:#FFFDF8;color:#2A2010;margin-bottom:0" /></div>'
    +'</div>'
    +'<div style="font-size:10px;font-weight:600;color:#6B5C30;text-transform:uppercase;letter-spacing:0.04em;margin-bottom:4px">Notes <span style="font-weight:400;color:#C8B88A;font-size:9px;text-transform:none">(optional)</span></div>'
    +'<textarea id="eed-note-'+i+'" placeholder="Add notes..." style="width:100%;height:52px;font-size:12px;border:1px solid #C8B88A;border-radius:8px;padding:8px 10px;background:#FFFDF8;color:#2A2010;resize:none;margin-bottom:10px">'+ (ev.note||'')+ '</textarea>'
    +'<div style="display:flex;gap:8px">'
    +'<button onclick="toggleEditEv('+i+')" style="flex:1;height:34px;font-size:12px;border-radius:8px;border:1px solid #C8B88A;background:#FFFDF8;cursor:pointer;color:#4A3D1A">Cancel</button>'
    +'<button onclick="saveEditEv('+i+')" style="flex:1;height:34px;font-size:12px;font-weight:500;border-radius:8px;border:1px solid #4A3D1A;background:#4A3D1A;cursor:pointer;color:#F5EFE6">Save</button>'
    +'</div>'
    +'</div></div>';
  }).join("");
}
function startEditEv(i){
  document.querySelectorAll(".ev-edit").forEach(function(f){f.style.display="none";});
  document.getElementById("ev-edit-"+i).style.display="block";
}
function toggleEditEv(i){
  var form=document.getElementById("ev-edit-"+i);
  var isOpen=form&&form.style.display==="block";
  // Close all forms and reset all buttons
  document.querySelectorAll(".ev-edit").forEach(function(f){f.style.display="none";});
  document.querySelectorAll("[id^='ev-edit-btn-']").forEach(function(b){b.textContent="Edit";b.style.background="rgba(255,255,255,0.75)";});
  if(!isOpen&&form){
    form.style.display="block";
    var btn=document.getElementById("ev-edit-btn-"+i);
    if(btn){btn.textContent="Close";btn.style.background="rgba(200,184,138,0.4)";}
  }
}
function cancelEditEv(i){document.getElementById("ev-edit-"+i).style.display="none";}
function saveEditEv(i){var allDayCb=document.getElementById("eed-allday-"+i);D.events[i].allDay=allDayCb?allDayCb.checked:false;D.events[i].date=document.getElementById("eed-date-"+i).value;D.events[i].endDate=document.getElementById("eed-end-"+i).value||"";D.events[i].startTime=D.events[i].allDay?"":document.getElementById("eed-stime-"+i).value||"";D.events[i].endTime="";D.events[i].title=document.getElementById("eed-title-"+i).value.trim()||D.events[i].title;D.events[i].note=document.getElementById("eed-note-"+i).value.trim();D.events[i].color=document.getElementById("eed-color-"+i).value;ss(KEYS.events,D.events);renderCal();}

function openEvForDay(){
  var date = new Date(calYear, calMonth, selectedCalDay);
  var dateStr = date.toISOString().slice(0,10);
  document.getElementById("ev-date").value = dateStr;
  document.getElementById("ev-end-date").value = "";
  document.getElementById("ev-start-time").value = "";
  document.getElementById("ev-allday").checked = false;
  document.getElementById("ev-time-field").style.display = "";
  document.getElementById("ev-title").value = "";
  document.getElementById("ev-note-field").value = "";
  document.getElementById("ev-modal").classList.add("open");
}


function toggleInlineAllDay(i) {
  var cb = document.getElementById('eed-allday-'+i);
  var tf = document.getElementById('eed-timefield-'+i);
  var st = document.getElementById('eed-stime-'+i);
  if (!cb || !tf) return;
  if (cb.checked) { tf.style.display='none'; if(st) st.value=''; }
  else { tf.style.display='block'; }
}
function toggleAllDay() {
  var allDay = document.getElementById('ev-allday').checked;
  var timeField = document.getElementById('ev-time-field');
  var timeInput = document.getElementById('ev-start-time');
  if (allDay) {
    timeField.style.display = 'none';
    timeInput.value = '';
  } else {
    timeField.style.display = '';
  }
}
function openEvModal(){document.getElementById("ev-date").value="";document.getElementById("ev-end-date").value="";document.getElementById("ev-start-time").value="";document.getElementById("ev-allday").checked=false;document.getElementById("ev-time-field").style.display="";document.getElementById("ev-title").value="";document.getElementById("ev-note-field").value="";document.getElementById("ev-modal").classList.add("open");}
function closeEvModal(){document.getElementById("ev-modal").classList.remove("open");}
function saveEvent(){var date=document.getElementById("ev-date").value,title=document.getElementById("ev-title").value.trim();if(!date||!title)return;var endDate=document.getElementById("ev-end-date").value;var allDay=document.getElementById("ev-allday").checked;var startTime=allDay?"":document.getElementById("ev-start-time").value;D.events.push({date:date,title:title,endDate:endDate||"",startTime:startTime||"",endTime:"",allDay:allDay,note:document.getElementById("ev-note-field").value.trim(),color:document.getElementById("ev-color").value});ss(KEYS.events,D.events);closeEvModal();renderCal();}
function delEv(i){D.events.splice(i,1);ss(KEYS.events,D.events);renderCal();}
function renderNotes(){var el=document.getElementById("notes-list");if(!D.notes.length){el.innerHTML='<div style="font-size:12px;color:#C8B88A;padding:8px 0">No notes yet.</div>';return;}el.innerHTML=D.notes.map(function(n,i){return'<div class="note-item"><span>'+n.text+'</span><button class="del-btn" onclick="delNote('+i+')">&#215;</button></div>';}).join("");}
function addNote(){var t=document.getElementById("note-input").value.trim();if(!t)return;D.notes.push({id:Date.now(),text:t});ss(KEYS.notes,D.notes);document.getElementById("note-input").value="";renderNotes();}
function delNote(i){D.notes.splice(i,1);ss(KEYS.notes,D.notes);renderNotes();}
function freqDays(m){var map={daily:1,weekly:7,"2weeks":14,monthly:30,"6weeks":42,"2months":60,"3months":91,"6months":182,yearly:365};if(m.freqType==="custom"){var n=parseInt(m.customNum)||1,u=m.customUnit||"days";return u==="weeks"?n*7:u==="months"?n*30:n;}return map[m.freqType]||1;}
function freqLabel(m){var map={daily:"Daily",weekly:"Weekly","2weeks":"Every 2 wks",monthly:"Monthly","6weeks":"Every 6 wks","2months":"Every 2 mo","3months":"Every 3 mo","6months":"Every 6 mo",yearly:"Yearly"};if(m.freqType==="custom")return "Every "+m.customNum+" "+m.customUnit;return map[m.freqType]||m.freqType;}
function calcNext(m,count){if(!m.startDate)return[];var days=freqDays(m),cur=new Date(m.startDate+"T12:00:00"),today=new Date();today.setHours(0,0,0,0);while(cur<=today)cur=new Date(cur.getTime()+days*86400000);var out=[];for(var i=0;i<count;i++){out.push(new Date(cur));cur=new Date(cur.getTime()+days*86400000);}return out;}
function dueStatus(d){var today=new Date();today.setHours(0,0,0,0);var diff=Math.round((d-today)/86400000);if(diff<0)return{cls:"due-over",label:"Overdue"};if(diff===0)return{cls:"due-soon",label:"Due today"};if(diff<=7)return{cls:"due-soon",label:"In "+diff+"d"};return{cls:"due-ok",label:d.toLocaleDateString("en-US",{month:"short",day:"numeric"})};}
function toggleCustomFreq(){document.getElementById("custom-freq-row").style.display=document.getElementById("med-freq").value==="custom"?"flex":"none";}
function renderPets(){
  var el=document.getElementById("pet-list");
  if(!D.pets.length){el.innerHTML='<div style="font-size:12px;color:#C8B88A;padding:8px 0">No pets added yet.</div>';document.getElementById("add-med-card").style.display="none";return;}
  el.innerHTML=D.pets.map(function(pet,pi){
    var meds=(pet.meds||[]).map(function(m,mi){var nd=calcNext(m,3),st=nd.length?dueStatus(nd[0]):{cls:"due-ok",label:"--"},sched=nd.map(function(d){return d.toLocaleDateString("en-US",{month:"short",day:"numeric",year:"numeric"});}).join(" · ");
      return'<div class="pet-row"><div class="given-dot '+(m.given?"given":"")+'" onclick="toggleGiven('+pi+','+mi+')"></div><div style="flex:1"><div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap"><span style="font-size:13px;font-weight:500;color:#2A2010;'+(m.given?"text-decoration:line-through;color:#C8B88A":"")+'">'+m.name+'</span>'+(m.dose?'<span style="font-size:11px;color:#8B7D50">'+m.dose+'</span>':"")+'<span style="font-size:10px;padding:1px 7px;border-radius:20px;background:#EDE5CC;color:#6B5C30">'+freqLabel(m)+'</span><span class="due-badge '+st.cls+'">'+st.label+'</span><button class="del-btn" onclick="delMed('+pi+','+mi+')">&#215;</button></div>'+(m.note?'<div class="pet-note-txt">'+m.note+'</div>':"")+(sched?'<div class="sched">Next: '+sched+'</div>':"")+'</div></div>';
    }).join("");
    return'<div style="margin-bottom:10px"><div class="pet-hdr"><span style="font-size:13px;font-weight:600;color:#4A3D1A">'+pet.name+(pet.species?' <span style="font-weight:400;font-size:11px;color:#8B7D50">('+pet.species+')</span>':"")+'</span><div style="display:flex;gap:6px"><button class="btn '+(selPet===pi?"btn-warm":"")+'" onclick="selectPet('+pi+')">+ Add med</button><button class="del-btn" onclick="delPet('+pi+')">&#215;</button></div></div>'+(meds||'<div style="font-size:12px;color:#C8B88A;padding:6px 0">No medicines yet.</div>')+'</div>';
  }).join("");
}
function selectPet(pi){selPet=pi;document.getElementById("add-med-title").textContent="Add medicine for "+D.pets[pi].name;document.getElementById("add-med-card").style.display="block";renderPets();}
function addMed(){if(selPet===null)return;var name=document.getElementById("med-name").value.trim();if(!name)return;if(!D.pets[selPet].meds)D.pets[selPet].meds=[];D.pets[selPet].meds.push({name:name,dose:document.getElementById("med-dose").value.trim(),startDate:document.getElementById("med-start").value,freqType:document.getElementById("med-freq").value,customNum:document.getElementById("med-custom-num").value,customUnit:document.getElementById("med-custom-unit").value,note:document.getElementById("med-note").value.trim(),given:false});ss(KEYS.pets,D.pets);document.getElementById("med-name").value="";document.getElementById("med-dose").value="";document.getElementById("med-start").value="";document.getElementById("med-note").value="";renderPets();}
function toggleGiven(pi,mi){D.pets[pi].meds[mi].given=!D.pets[pi].meds[mi].given;ss(KEYS.pets,D.pets);renderPets();}
function delMed(pi,mi){D.pets[pi].meds.splice(mi,1);ss(KEYS.pets,D.pets);renderPets();}
function delPet(pi){if(selPet===pi)selPet=null;D.pets.splice(pi,1);ss(KEYS.pets,D.pets);renderPets();}
function openPetModal(){document.getElementById("pet-name-input").value="";document.getElementById("pet-species-input").value="";document.getElementById("pet-modal").classList.add("open");}
function closePetModal(){document.getElementById("pet-modal").classList.remove("open");}
function savePet(){var name=document.getElementById("pet-name-input").value.trim();if(!name)return;D.pets.push({name:name,species:document.getElementById("pet-species-input").value.trim(),meds:[]});ss(KEYS.pets,D.pets);closePetModal();renderPets();}
function weekBounds(offset){var now=new Date(),day=now.getDay(),sun=new Date(now);sun.setDate(now.getDate()-day+(offset*7));sun.setHours(0,0,0,0);var sat=new Date(sun);sat.setDate(sun.getDate()+6);sat.setHours(23,59,59,999);return{start:sun,end:sat};}
function fmtD(d){return d.toLocaleDateString("en-US",{month:"short",day:"numeric"});}
function renderOverview(){
  var tw=weekBounds(0),nw=weekBounds(1);
  var evTW=D.events.filter(function(e){var d=new Date(e.date+"T12:00:00");return d>=tw.start&&d<=tw.end;}).sort(function(a,b){return a.date.localeCompare(b.date);});
  var evNW=D.events.filter(function(e){var d=new Date(e.date+"T12:00:00");return d>=nw.start&&d<=nw.end;}).sort(function(a,b){return a.date.localeCompare(b.date);});
  var now=new Date(),upMeds=[];
  D.pets.forEach(function(pet){(pet.meds||[]).forEach(function(m){var nd=calcNext(m,1);if(!nd.length)return;var diff=Math.round((nd[0]-now)/86400000);if(diff<=14)upMeds.push({petName:pet.name,medName:m.name,next:nd[0]});});});
  upMeds.sort(function(a,b){return a.next-b.next;});
  function evRows(arr){if(!arr.length)return'<div class="ov-empty">Nothing scheduled</div>';return arr.map(function(ev){return'<div class="ov-ev ov-ev-'+ev.color.replace("ev-","")+'">'+fmtD(new Date(ev.date+"T12:00:00"))+" — "+ev.title+'</div>';}).join("");}
  document.getElementById("ov-top").innerHTML='<div class="ov-card ov-card-brown"><div class="ov-sec-hdr">This week <span style="font-weight:400;text-transform:none;letter-spacing:0;color:#8B7D50">'+fmtD(tw.start)+"–"+fmtD(tw.end)+'</span></div>'+evRows(evTW)+'</div><div class="ov-card ov-card-tan"><div class="ov-sec-hdr">Next week <span style="font-weight:400;text-transform:none;letter-spacing:0;color:#8B7D50">'+fmtD(nw.start)+"–"+fmtD(nw.end)+'</span></div>'+evRows(evNW)+'</div>';
  var medHTML=upMeds.length?upMeds.map(function(m){var st=dueStatus(m.next);return'<div class="ov-med-row"><span style="flex:1">'+m.petName+" — "+m.medName+'</span><span class="due-badge '+st.cls+'">'+st.label+'</span></div>';}).join(""):'<div class="ov-empty">No medicines due in the next 2 weeks</div>';
  document.getElementById("ov-pets-card").innerHTML='<div class="ov-sec-hdr">Pet meds due soon</div>'+medHTML;
  var notesHTML=D.notes.length?D.notes.map(function(n){return'<div class="ov-note">'+n.text+'</div>';}).join(""):'<div class="ov-empty">No notes</div>';
  document.getElementById("ov-notes-card").innerHTML='<div class="ov-sec-hdr">Notes &amp; reminders</div>'+notesHTML;
  // Budget summary on overview
  var budgetOvEl = document.getElementById("ov-budget-card");
  if (budgetOvEl) {
    var budgetEntries = budgetStore(0);
    var budgetTotal = 0;
    budgetEntries.forEach(function(e){ budgetTotal += e.amount; });
    var budgetHTML = '<div class="ov-sec-hdr">Budget this month</div>';
    if (budgetEntries.length) {
      budgetHTML += '<div style="display:flex;justify-content:space-between;align-items:baseline;padding:4px 0">';
      budgetHTML += '<span style="font-size:16px;font-weight:700;color:#2A2010">$' + budgetTotal.toFixed(2) + '</span>';
      budgetHTML += '<span style="font-size:11px;color:#8B7D50">' + budgetEntries.length + ' expense' + (budgetEntries.length!==1?'s':'') + '</span></div>';
      var budCats = {};
      budgetEntries.forEach(function(e){ budCats[e.cat] = (budCats[e.cat]||0) + e.amount; });
      var topCats = Object.keys(budCats).sort(function(a,b){return budCats[b]-budCats[a];}).slice(0,3);
      topCats.forEach(function(c) {
        budgetHTML += '<div style="font-size:11px;color:#4A3D1A;padding:2px 0">'+c+': <span style="color:#8B7D50">$'+budCats[c].toFixed(2)+'</span></div>';
      });
    } else {
      budgetHTML += '<div class="ov-empty">No expenses this month</div>';
    }
    budgetOvEl.innerHTML = budgetHTML;
  }
}





var editingRecipeIdx = null;

var defaultRecipes = [
  {
    id: 1,
    name: "Chicken Parmesan",
    desc: "Crispy breaded chicken with marinara and melted mozzarella",
    ingredients: [
      "2 chicken breasts",
      "1 cup Italian breadcrumbs",
      "2 eggs",
      "1 cup marinara sauce",
      "1 cup shredded mozzarella",
      "1/2 cup grated parmesan",
      "2 tbsp olive oil",
      "Salt and pepper"
    ]
  },
  {
    id: 2,
    name: "Beef Tacos",
    desc: "Classic ground beef tacos with all the toppings",
    ingredients: [
      "1 lb ground beef",
      "1 packet taco seasoning",
      "8 small flour tortillas",
      "1 cup shredded cheddar",
      "1 cup shredded lettuce",
      "2 roma tomatoes",
      "1/2 cup sour cream",
      "1 avocado",
      "1 lime"
    ]
  },
  {
    id: 3,
    name: "Pasta Primavera",
    desc: "Light pasta with fresh vegetables and parmesan",
    ingredients: [
      "12 oz penne pasta",
      "1 zucchini",
      "1 bell pepper",
      "1 cup cherry tomatoes",
      "3 cloves garlic",
      "1/4 cup olive oil",
      "1/2 cup parmesan",
      "Fresh basil",
      "Salt and pepper"
    ]
  }
];

function recipeStore() {
  return ls('mz2_recipes') || defaultRecipes;
}

function recipePlan() {
  return ls('mz2_plan') || [];
}

function renderRecipes() {
  var recipes = recipeStore();
  var plan = recipePlan();
  var planIds = plan.map(function(r) { return r.id; });
  var el = document.getElementById('recipe-list');

  if (!recipes.length) {
    el.innerHTML = '<div style="font-size:12px;color:#C8B88A;padding:8px 0">No recipes saved yet. Tap + Add recipe to get started.</div>';
  } else {
    el.innerHTML = recipes.map(function(r, i) {
      var inPlan = planIds.indexOf(r.id) !== -1;
      return '<div style="padding:10px 0;border-bottom:1px solid #EDE5CC">' +
        '<div style="display:flex;align-items:flex-start;justify-content:space-between;gap:8px">' +
          '<div style="flex:1">' +
            '<div style="font-size:13px;font-weight:600;color:#2A2010">' + r.name + '</div>' +
            (r.desc ? '<div style="font-size:11px;color:#8B7D50;margin-top:2px">' + r.desc + '</div>' : '') +
            '<div style="font-size:11px;color:#A0845A;margin-top:4px">' + r.ingredients.length + ' ingredients</div>' +
          '</div>' +
          '<div style="display:flex;gap:6px;flex-shrink:0;align-items:center;margin-top:2px">' +
            '<button class="btn" style="font-size:11px;height:28px;' + (inPlan ? 'background:#4A3D1A;color:#F5EFE6;border-color:#4A3D1A' : '') + '" onclick="togglePlan(' + i + ')">' +
              (inPlan ? '✓ This week' : '+ This week') +
            '</button>' +
            '<button class="btn" style="font-size:11px;height:28px" onclick="openRecipeModal(' + i + ')">Edit</button>' +
            '<button class="del-btn" onclick="deleteRecipe(' + i + ')">&#215;</button>' +
          '</div>' +
        '</div>' +
      '</div>';
    }).join('');
  }

  renderPlan();
}

function renderPlan() {
  var plan = recipePlan();
  var card = document.getElementById('recipe-plan-card');
  var el = document.getElementById('recipe-plan-list');
  if (!plan.length) { card.style.display = 'none'; return; }
  card.style.display = 'block';
  el.innerHTML = plan.map(function(r, i) {
    return '<div style="padding:8px 0;border-bottom:1px solid #EDE5CC;display:flex;align-items:flex-start;justify-content:space-between;gap:8px">' +
      '<div>' +
        '<div style="font-size:13px;font-weight:600;color:#2A2010">' + r.name + '</div>' +
        '<div style="font-size:11px;color:#8B7D50;margin-top:2px">' + r.ingredients.join(', ') + '</div>' +
      '</div>' +
      '<button class="del-btn" onclick="removePlan(' + i + ')">&#215;</button>' +
    '</div>';
  }).join('');
}

function togglePlan(i) {
  var recipes = recipeStore();
  var plan = recipePlan();
  var r = recipes[i];
  var idx = -1;
  for (var fi = 0; fi < plan.length; fi++) { if (plan[fi].id === r.id) { idx = fi; break; } }
  if (idx === -1) {
    plan.push(r);
  } else {
    plan.splice(idx, 1);
  }
  ss('mz2_plan', plan);
  renderRecipes();
  document.getElementById('recipe-added-confirm').style.display = 'none';
}

function removePlan(i) {
  var plan = recipePlan();
  plan.splice(i, 1);
  ss('mz2_plan', plan);
  renderRecipes();
}

function addPlanToGrocery() {
  var plan = recipePlan();
  if (!plan.length) { alert('No recipes selected for this week yet.'); return; }
  var who = 's';
  var count = 0;
  plan.forEach(function(r) {
    r.ingredients.forEach(function(ing) {
      D.grocery.push({ id: Date.now() + Math.random(), text: ing, note: r.name, done: false, who: '' });
      count++;
    });
  });
  ss(KEYS.grocery, D.grocery);
  renderGrocery();
  ss('mz2_plan', []);
  document.getElementById('recipe-added-confirm').style.display = 'block';
  document.getElementById('recipe-confirm-msg').textContent = count + ' ingredients from ' + plan.length + ' recipe' + (plan.length !== 1 ? 's' : '') + ' added to your grocery list.';
  renderRecipes();
}

function viewRecipe(i) {
  var r = recipeStore()[i];
  alert(r.name + '\n\n' + r.ingredients.map(function(ing) { return '• ' + ing; }).join('\n'));
}

function deleteRecipe(i) {
  var recipes = recipeStore();
  var deleted = recipes[i];
  recipes.splice(i, 1);
  ss('mz2_recipes', recipes);
  // Also remove from plan if present
  var oldPlan = recipePlan();
  var plan = [];
  for (var fi = 0; fi < oldPlan.length; fi++) { if (oldPlan[fi].id !== deleted.id) plan.push(oldPlan[fi]); }
  ss('mz2_plan', plan);
  renderRecipes();
}

function openRecipeModal(idx) {
  editingRecipeIdx = (idx !== undefined) ? idx : null;
  document.getElementById('rm-name').value = '';
  document.getElementById('rm-desc').value = '';
  document.getElementById('rm-ingredients').value = '';
  if (editingRecipeIdx !== null) {
    var r = recipeStore()[editingRecipeIdx];
    document.getElementById('rm-name').value = r.name;
    document.getElementById('rm-desc').value = r.desc || '';
    document.getElementById('rm-ingredients').value = r.ingredients.join('\n');
    document.getElementById('recipe-modal-title').textContent = 'Edit recipe';
  } else {
    document.getElementById('recipe-modal-title').textContent = 'Add recipe';
  }
  document.getElementById('recipe-modal').classList.add('open');
}

function closeRecipeModal() {
  document.getElementById('recipe-modal').classList.remove('open');
}

function saveRecipe() {
  var name = document.getElementById('rm-name').value.trim();
  if (!name) return;
  var desc = document.getElementById('rm-desc').value.trim();
  var ings = document.getElementById('rm-ingredients').value.split('\n').map(function(l) { return l.trim(); }).filter(function(l) { return l.length > 0; });
  if (!ings.length) return;
  var recipes = recipeStore();
  if (editingRecipeIdx !== null) {
    recipes[editingRecipeIdx] = { id: recipes[editingRecipeIdx].id, name: name, desc: desc, ingredients: ings };
  } else {
    recipes.push({ id: Date.now(), name: name, desc: desc, ingredients: ings });
  }
  ss('mz2_recipes', recipes);
  closeRecipeModal();
  renderRecipes();
}

function deleteChecked() {
  D.grocery = D.grocery.filter(function(i) { return !i.done; });
  ss(KEYS.grocery, D.grocery);
  renderGrocery();
}
function deleteAll() {
  if (!confirm('Clear the entire grocery list?')) return;
  D.grocery = [];
  ss(KEYS.grocery, D.grocery);
  renderGrocery();
}

// ── MEAL PLANNER ──────────────────────────────────────────────────────────────
var mealWeekOffset = 0;
var editingMealDay = null;
var editingMealSlot = null;
var DAYS = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
var MEAL_COLORS = {Breakfast:'#EDE5CC',Lunch:'#E8DCC8',Dinner:'#DDE8C0',Snack:'#F0E8D8'};
var MEAL_BORDER = {Breakfast:'#8B7D50',Lunch:'#A0845A',Dinner:'#5C6020',Snack:'#C8A870'};

function getMealWeekStart(offset) {
  var now = new Date();
  var day = now.getDay();
  var sun = new Date(now);
  sun.setDate(now.getDate() - day + (offset * 7));
  sun.setHours(0,0,0,0);
  return sun;
}

function mealKey(offset) {
  var d = getMealWeekStart(offset);
  return 'mz2_meals_' + d.toISOString().slice(0,10);
}

function getMeals() { return ls(mealKey(mealWeekOffset)) || {}; }
function saveMeals(data) { ss(mealKey(mealWeekOffset), data); }

function prevMealWeek() { mealWeekOffset--; renderMeals(); }
function nextMealWeek() { mealWeekOffset++; renderMeals(); }

function renderMeals() {
  var weekStart = getMealWeekStart(mealWeekOffset);
  var meals = getMeals();
  var today = new Date(); today.setHours(0,0,0,0);

  // Week label
  var endDay = new Date(weekStart); endDay.setDate(weekStart.getDate()+6);
  document.getElementById('meal-week-label').textContent =
    weekStart.toLocaleDateString('en-US',{month:'short',day:'numeric'}) + ' – ' +
    endDay.toLocaleDateString('en-US',{month:'short',day:'numeric'});

  var html = '';
  for (var d = 0; d < 7; d++) {
    var date = new Date(weekStart); date.setDate(weekStart.getDate() + d);
    var dateStr = date.toISOString().slice(0,10);
    var isToday = date.getTime() === today.getTime();
    var dayMeals = meals[dateStr] || [];

    html += '<div style="padding:8px 0;border-bottom:1px solid #EDE5CC">';
    html += '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:6px">';
    html += '<div style="font-size:12px;font-weight:600;color:' + (isToday ? '#4A3D1A' : '#8B7D50') + ';' + (isToday ? 'background:#EDE5CC;padding:2px 8px;border-radius:20px;' : '') + '">' + DAYS[date.getDay()] + ' <span style="font-weight:400;color:#A0845A">' + date.toLocaleDateString('en-US',{month:'short',day:'numeric'}) + '</span></div>';
    html += '<button class="btn" style="font-size:10px;height:24px;padding:0 8px" onclick="openMealModal(\'' + dateStr + '\')">+ Add</button>';
    html += '</div>';

    if (dayMeals.length) {
      dayMeals.forEach(function(m, mi) {
        html += '<div style="display:flex;align-items:center;gap:6px;margin-bottom:4px;padding:5px 8px;background:' + (MEAL_COLORS[m.type]||'#EDE5CC') + ';border-left:3px solid ' + (MEAL_BORDER[m.type]||'#8B7D50') + '">';
        html += '<span style="font-size:10px;color:#8B7D50;min-width:60px">' + m.type + '</span>';
        html += '<span style="font-size:12px;font-weight:500;color:#2A2010;flex:1">' + m.name + '</span>';
        if (m.notes) html += '<span style="font-size:11px;color:#A0845A;font-style:italic">' + m.notes + '</span>';
        html += '<button class="del-btn" onclick="deleteMeal(\'' + dateStr + '\',' + mi + ')">&#215;</button>';
        html += '</div>';
      });
    } else {
      html += '<div style="font-size:11px;color:#C8B88A;font-style:italic;padding:2px 0">Nothing planned</div>';
    }
    html += '</div>';
  }
  document.getElementById('meal-days').innerHTML = html;
}

function openMealModal(dateStr) {
  editingMealDay = dateStr;
  document.getElementById('meal-name-input').value = '';
  document.getElementById('meal-notes-input').value = '';
  document.getElementById('meal-type-input').value = 'Dinner';
  var d = new Date(dateStr + 'T12:00:00');
  document.getElementById('meal-modal-day-label').textContent = DAYS[d.getDay()] + ', ' + d.toLocaleDateString('en-US',{month:'long',day:'numeric'});

  // Populate recipe picker
  var recipes = recipeStore();
  var picker = document.getElementById('meal-recipe-picker');
  if (!recipes.length) {
    picker.innerHTML = '<div style="font-size:11px;color:#C8B88A;font-style:italic">No saved recipes yet — add some in the Recipes tab.</div>';
  } else {
    // Build buttons safely without inline onclick strings
    picker.innerHTML = '';
    recipes.forEach(function(r, ri) {
      var btn = document.createElement('button');
      btn.className = 'meal-recipe-btn';
      btn.setAttribute('data-recipe-idx', ri);
      btn.innerHTML = '<span style="font-size:13px;font-weight:500;color:#2A2010">' + r.name + '</span>' +
        (r.desc ? '<span style="font-size:11px;color:#8B7D50;margin-left:6px">' + r.desc + '</span>' : '');
      btn.addEventListener('click', function(){
        selectRecipeForMeal(r.name);
      });
      picker.appendChild(btn);
    });
  }

  document.getElementById('meal-modal').classList.add('open');
}

function selectRecipeForMeal(name) {
  document.getElementById('meal-name-input').value = name;
  document.getElementById('meal-type-input').value = 'Dinner';
  document.querySelectorAll('.meal-recipe-btn').forEach(function(btn) {
    var firstSpan = btn.querySelector('span');
    var isSelected = firstSpan && firstSpan.textContent.trim() === name;
    btn.style.background = isSelected ? '#4A3D1A' : '#F5EFE6';
    btn.style.borderColor = isSelected ? '#4A3D1A' : '#C8B88A';
    if (firstSpan) firstSpan.style.color = isSelected ? '#F5EFE6' : '#2A2010';
    var sub = btn.querySelectorAll('span')[1];
    if (sub) sub.style.color = isSelected ? '#C8B88A' : '#8B7D50';
  });
}
function closeMealModal() { document.getElementById('meal-modal').classList.remove('open'); }
function saveMeal() {
  var name = document.getElementById('meal-name-input').value.trim(); if (!name) return;
  var type = document.getElementById('meal-type-input').value;
  var notes = document.getElementById('meal-notes-input').value.trim();
  var meals = getMeals();
  if (!meals[editingMealDay]) meals[editingMealDay] = [];
  meals[editingMealDay].push({name:name,type:type,notes:notes});
  saveMeals(meals);
  closeMealModal();
  renderMeals();
}
function deleteMeal(dateStr, mi) {
  var meals = getMeals();
  if (meals[dateStr]) { meals[dateStr].splice(mi,1); saveMeals(meals); renderMeals(); }
}

// ── HOME MAINTENANCE ──────────────────────────────────────────────────────────
var defaultHomeTasks = [
  {id:1, task:'Change furnace filter', date:'2026-01-15', freqType:'3months', notes:'16x25x1 filter, basement utility room', done:false},
  {id:2, task:'Clean gutters', date:'2025-11-01', freqType:'6months', notes:'Call Mike at ABC Gutters if needed', done:true},
  {id:3, task:'Car oil change — Brent', date:'2026-03-10', interval:'Every 5,000 miles / 6 months', notes:'Valvoline on Route 9', done:true},
  {id:4, task:'HVAC annual service', date:'2026-04-01', freqType:'yearly', interval:'Every year', notes:'Schedule before summer', done:false}
];

function homeStore() { return ls('mz2_home') || defaultHomeTasks; }


function homeFreqDays(t) {
  var map = {weekly:7,'2weeks':14,monthly:30,'2months':60,'3months':91,'6months':182,yearly:365};
  if (!t.freqType || t.freqType === '') return null;
  if (t.freqType === 'custom') {
    var n = parseInt(t.customNum)||1, u = t.customUnit||'months';
    return u==='weeks'?n*7:u==='months'?n*30:n;
  }
  return map[t.freqType]||null;
}

function homeFreqLabel(t) {
  var map = {weekly:'Every week','2weeks':'Every 2 wks',monthly:'Monthly','2months':'Every 2 mo','3months':'Every 3 mo','6months':'Every 6 mo',yearly:'Yearly'};
  if (!t.freqType || t.freqType === '') return null;
  if (t.freqType === 'custom') return 'Every '+t.customNum+' '+t.customUnit;
  return map[t.freqType]||null;
}

function homeCalcNext(t, count) {
  var days = homeFreqDays(t);
  if (!days || !t.date) return [];
  var cur = new Date(t.date+'T12:00:00');
  var today = new Date(); today.setHours(0,0,0,0);
  while(cur <= today) cur = new Date(cur.getTime() + days*86400000);
  var out = [];
  for (var i=0; i<count; i++) { out.push(new Date(cur)); cur = new Date(cur.getTime()+days*86400000); }
  return out;
}
function renderHome() {
  var tasks = homeStore();
  var today = new Date(); today.setHours(0,0,0,0);
  var overdue=[], upcoming=[], done=[];
  tasks.forEach(function(t,i) {
    var d = t.date ? new Date(t.date+'T12:00:00') : null;
    var diff = d ? Math.round((d-today)/86400000) : null;
    if (t.done) done.push({t:t,i:i,d:d,diff:diff});
    else if (d && diff < 0) overdue.push({t:t,i:i,d:d,diff:diff});
    else upcoming.push({t:t,i:i,d:d,diff:diff});
  });

  function taskHTML(item) {
    var t=item.t, i=item.i, d=item.d, diff=item.diff;
    var badge='', badgeStyle='';
    if (!t.done && d) {
      if (diff < 0) { badge='Overdue'; badgeStyle='background:#F0C8B0;color:#6B2010'; }
      else if (diff === 0) { badge='Due today'; badgeStyle='background:#F0E0B0;color:#5A3A10'; }
      else if (diff <= 30) { badge='In '+diff+'d'; badgeStyle='background:#F0E0B0;color:#5A3A10'; }
      else { badge=d.toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'}); badgeStyle='background:#EDE5CC;color:#4A3D1A'; }
    }
    var editId = 'home-edit-'+i;
    return '<div style="padding:10px 0;border-bottom:1px solid #EDE5CC">' +
      '<div style="display:flex;align-items:flex-start;gap:8px">' +
        '<div class="circle '+(t.done?'done':'')+'" onclick="toggleHomeTask('+i+')" style="margin-top:2px;flex-shrink:0">'+chk()+'</div>' +
        '<div style="flex:1">' +
          '<div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">' +
            '<span style="font-size:13px;font-weight:600;color:#2A2010;'+(t.done?'text-decoration:line-through;color:#C8B88A':'')+'">'+t.task+'</span>' +
            (badge ? '<span style="font-size:10px;padding:2px 8px;border-radius:20px;font-weight:500;'+badgeStyle+'">'+badge+'</span>' : '') +
            '<button onclick="toggleHomeEdit('+i+')" style="font-size:11px;font-weight:500;padding:0 10px;height:28px;border-radius:6px;border:1px solid #C8B88A;background:#F5EFE6;cursor:pointer;color:#4A3D1A;flex-shrink:0">Edit</button>' +
            '<button class="del-btn" onclick="deleteHomeTask('+i+')">&#215;</button>' +
          '</div>' +
          (homeFreqLabel(t) ? '<div style="font-size:11px;color:#8B7D50;margin-top:2px">'+homeFreqLabel(t)+'</div>' : (t.interval ? '<div style="font-size:11px;color:#8B7D50;margin-top:2px">'+t.interval+'</div>' : '')) +
          (function(){var nd=homeCalcNext(t,3);if(!nd.length)return'';var sched=nd.map(function(d){return d.toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'});}).join(' · ');return '<div style="font-size:11px;color:#A0845A;margin-top:2px">Next: '+sched+'</div>';})() +
          (t.notes ? '<div style="font-size:11px;color:#A0845A;font-style:italic;margin-top:2px">'+t.notes+'</div>' : '') +
          // Inline edit form
          '<div id="'+editId+'" style="display:none;margin-top:10px;padding:10px;background:#F5EFE6;border-radius:8px;border:1px solid #D8C8A0">' +
            '<div style="display:flex;flex-direction:column;gap:6px">' +
              '<div style="font-size:10px;font-weight:600;color:#8B7D50;text-transform:uppercase;letter-spacing:0.04em">Task name</div>' +
              '<input type="text" id="he-task-'+i+'" value="'+t.task.replace(/"/g,'&quot;')+'" style="height:32px;font-size:12px;border-radius:8px;border:1px solid #C8B88A;padding:0 10px;background:#FFFDF8;color:#2A2010;width:100%" />' +
              '<div style="display:flex;gap:8px">' +
                '<div style="flex:1">' +
                  '<div style="font-size:10px;font-weight:600;color:#8B7D50;text-transform:uppercase;letter-spacing:0.04em;margin-bottom:4px">Due date</div>' +
                  '<input type="date" id="he-date-'+i+'" value="'+(t.date||'')+'" style="height:32px;font-size:12px;border-radius:8px;border:1px solid #C8B88A;padding:0 8px;background:#FFFDF8;color:#2A2010;width:100%" />' +
                '</div>' +
                '<div style="flex:1">' +
                  '<div style="font-size:10px;font-weight:600;color:#8B7D50;text-transform:uppercase;letter-spacing:0.04em;margin-bottom:4px">Repeat frequency</div>' +
                  '<select id="he-freq-'+i+'" onchange="toggleHomeEditCustom('+i+')" style="height:32px;font-size:12px;border-radius:8px;border:1px solid #C8B88A;padding:0 6px;background:#FFFDF8;color:#2A2010;width:100%">' +
                  '<option value=""'+((!t.freqType||t.freqType==='')?'selected':'')+'>No repeat</option>' +
                  '<option value="weekly"'+(t.freqType==='weekly'?'selected':'')+'>Every week</option>' +
                  '<option value="2weeks"'+(t.freqType==='2weeks'?'selected':'')+'>Every 2 weeks</option>' +
                  '<option value="monthly"'+(t.freqType==='monthly'?'selected':'')+'>Monthly</option>' +
                  '<option value="2months"'+(t.freqType==='2months'?'selected':'')+'>Every 2 months</option>' +
                  '<option value="3months"'+(t.freqType==='3months'?'selected':'')+'>Every 3 months</option>' +
                  '<option value="6months"'+(t.freqType==='6months'?'selected':'')+'>Every 6 months</option>' +
                  '<option value="yearly"'+(t.freqType==='yearly'?'selected':'')+'>Every year</option>' +
                  '<option value="custom"'+(t.freqType==='custom'?'selected':'')+'>Custom...</option>' +
                  '</select>' +
                  '<div id="he-custom-'+i+'" style="display:'+(t.freqType==='custom'?'flex':'none')+';gap:6px;align-items:center;margin-top:4px">' +
                    '<span style="font-size:11px;color:#4A3D1A">Every</span>' +
                    '<input type="number" id="he-cnum-'+i+'" value="'+(t.customNum||'')+'" placeholder="6" min="1" style="width:50px;height:28px;font-size:12px;border-radius:6px;border:1px solid #C8B88A;padding:0 6px;background:#FFFDF8;color:#2A2010" />' +
                    '<select id="he-cunit-'+i+'" style="height:28px;font-size:12px;border-radius:6px;border:1px solid #C8B88A;padding:0 6px;background:#FFFDF8;color:#2A2010">' +
                    '<option value="days"'+(t.customUnit==='days'?'selected':'')+'>days</option>' +
                    '<option value="weeks"'+(t.customUnit==='weeks'?'selected':'')+'>weeks</option>' +
                    '<option value="months"'+(t.customUnit==='months'?'selected':'')+'>months</option>' +
                    '</select>' +
                  '</div>' +
                '</div>' +
              '</div>' +
              '<div style="font-size:10px;font-weight:600;color:#8B7D50;text-transform:uppercase;letter-spacing:0.04em">Notes</div>' +
              '<textarea id="he-notes-'+i+'" placeholder="e.g. filter size, contractor name, last completed..." style="height:72px;font-size:12px;border-radius:8px;border:1px solid #C8B88A;padding:8px 10px;background:#FFFDF8;color:#2A2010;width:100%;resize:none;line-height:1.5">'+(t.notes||'')+'</textarea>' +
              '<div style="display:flex;gap:6px">' +
                '<button onclick="toggleHomeEdit('+i+')" style="flex:1;height:32px;font-size:12px;border-radius:8px;border:1px solid #C8B88A;background:#FFFDF8;cursor:pointer;color:#4A3D1A">Cancel</button>' +
                '<button onclick="saveHomeEdit('+i+')" style="flex:1;height:32px;font-size:12px;font-weight:500;border-radius:8px;border:1px solid #4A3D1A;background:#4A3D1A;cursor:pointer;color:#F5EFE6">Save</button>' +
              '</div>' +
            '</div>' +
          '</div>' +
        '</div>' +
      '</div>' +
    '</div>';
  }

  var html = '';
  if (overdue.length) {
    html += '<div style="font-size:11px;font-weight:600;color:#6B2010;text-transform:uppercase;letter-spacing:0.04em;padding:4px 0 6px;border-bottom:1px solid #EDE5CC;margin-bottom:2px">Overdue</div>';
    overdue.forEach(function(item){html+=taskHTML(item);});
  }
  if (upcoming.length) {
    html += '<div style="font-size:11px;font-weight:600;color:#8B7D50;text-transform:uppercase;letter-spacing:0.04em;padding:8px 0 6px;border-bottom:1px solid #EDE5CC;margin-bottom:2px">Upcoming</div>';
    upcoming.forEach(function(item){html+=taskHTML(item);});
  }
  if (done.length) {
    html += '<div style="font-size:11px;font-weight:600;color:#C8B88A;text-transform:uppercase;letter-spacing:0.04em;padding:8px 0 6px;border-bottom:1px solid #EDE5CC;margin-bottom:2px">Completed</div>';
    done.forEach(function(item){html+=taskHTML(item);});
  }
  if (!tasks.length) html = '<div style="font-size:12px;color:#C8B88A;padding:8px 0">No tasks yet.</div>';
  document.getElementById('home-list').innerHTML = html;
}

function toggleHomeEdit(i) {
  var el = document.getElementById('home-edit-'+i);
  if (!el) return;
  var isOpen = el.style.display === 'block';
  document.querySelectorAll('[id^="home-edit-"]').forEach(function(f){f.style.display='none';});
  if (!isOpen) el.style.display = 'block';
}

function toggleHomeEditCustom(i){
  var v=document.getElementById('he-freq-'+i).value;
  document.getElementById('he-custom-'+i).style.display=v==='custom'?'flex':'none';
}

function saveHomeEdit(i) {
  var tasks = homeStore();
  tasks[i].task = document.getElementById('he-task-'+i).value.trim() || tasks[i].task;
  tasks[i].date = document.getElementById('he-date-'+i).value;
  tasks[i].freqType = document.getElementById('he-freq-'+i).value;
  tasks[i].customNum = document.getElementById('he-cnum-'+i) ? document.getElementById('he-cnum-'+i).value : '';
  tasks[i].customUnit = document.getElementById('he-cunit-'+i) ? document.getElementById('he-cunit-'+i).value : 'months';
  tasks[i].notes = document.getElementById('he-notes-'+i).value.trim();
  ss('mz2_home', tasks);
  renderHome();
}


function toggleHomeTask(i) {
  var tasks = homeStore(); tasks[i].done = !tasks[i].done;
  ss('mz2_home', tasks); renderHome();
}
function deleteHomeTask(i) {
  var tasks = homeStore(); tasks.splice(i,1); ss('mz2_home',tasks); renderHome();
}
function openHomeModal() {
  document.getElementById('hm-task').value='';document.getElementById('hm-date').value='';
  document.getElementById('hm-notes').value='';document.getElementById('hm-freq').value='';document.getElementById('hm-custom-row').style.display='none';
  document.getElementById('home-modal').classList.add('open');
}
function closeHomeModal() { document.getElementById('home-modal').classList.remove('open'); }
function toggleHomeCustomFreq(){
  var v=document.getElementById('hm-freq').value;
  document.getElementById('hm-custom-row').style.display=v==='custom'?'block':'none';
}

function saveHomeTask() {
  var task = document.getElementById('hm-task').value.trim(); if (!task) return;
  var tasks = homeStore();
  var freqType = document.getElementById('hm-freq').value;
  var customNum = document.getElementById('hm-custom-num').value;
  var customUnit = document.getElementById('hm-custom-unit').value;
  tasks.push({
    id:Date.now(), task:task,
    date:document.getElementById('hm-date').value,
    freqType:freqType, customNum:customNum, customUnit:customUnit,
    notes:document.getElementById('hm-notes').value.trim(),
    done:false
  });
  ss('mz2_home',tasks); closeHomeModal(); renderHome();
}

// ── LUKA ─────────────────────────────────────────────────────────────────────
var SUBJ_COLORS = {Math:'#E6F1FB',Reading:'#EDE5CC',Science:'#DDE8C0',History:'#F0E8D8',General:'#F0EFE8',Other:'#EDE5CC'};
var SUBJ_TEXT = {Math:'#0C447C',Reading:'#4A3D1A',Science:'#2E3310',History:'#5A4A28',General:'#5F5E5A',Other:'#4A3D1A'};

function lukaEvents() { return ls('mz2_luka_events') || []; }
function lukaTasks() { return ls('mz2_luka_tasks') || []; }

function renderLuka() {
  // Events
  var events = lukaEvents().slice().sort(function(a,b){return a.date.localeCompare(b.date);});
  var evEl = document.getElementById('luka-list');
  if (!events.length) {
    evEl.innerHTML = '<div style="font-size:12px;color:#C8B88A;padding:8px 0">No events yet.</div>';
  } else {
    evEl.innerHTML = events.map(function(ev,i) {
      var d = new Date(ev.date+'T12:00:00');
      var lbl = d.toLocaleDateString('en-US',{weekday:'short',month:'short',day:'numeric'});
      return '<div style="padding:8px 0;border-bottom:1px solid #EDE5CC">' +
        '<div style="display:flex;align-items:flex-start;justify-content:space-between;gap:8px">' +
          '<div>' +
            '<div style="font-size:13px;font-weight:600;color:#2A2010">' + ev.title + '</div>' +
            '<div style="font-size:11px;color:#8B7D50;margin-top:2px">' + lbl + (ev.time?' · '+ev.time:'') + (ev.location?' · '+ev.location:'') + '</div>' +
            (ev.notes?'<div style="font-size:11px;color:#A0845A;font-style:italic;margin-top:2px">'+ev.notes+'</div>':'') +
          '</div>' +
          '<button class="del-btn" onclick="deleteLukaEvent('+i+')">&#215;</button>' +
        '</div></div>';
    }).join('');
  }

  // Tasks
  var tasks = lukaTasks();
  var taskEl = document.getElementById('luka-tasks');
  if (!tasks.length) {
    taskEl.innerHTML = '<div style="font-size:12px;color:#C8B88A;padding:8px 0">No tasks yet.</div>';
  } else {
    var today = new Date(); today.setHours(0,0,0,0);
    taskEl.innerHTML = tasks.map(function(t,i) {
      var d = t.due ? new Date(t.due+'T12:00:00') : null;
      var diff = d ? Math.round((d-today)/86400000) : null;
      var badge='', bStyle='';
      if (d && !t.done) {
        if (diff<0){badge='Overdue';bStyle='background:#F0C8B0;color:#6B2010';}
        else if(diff===0){badge='Due today';bStyle='background:#F0E0B0;color:#5A3A10';}
        else if(diff<=3){badge='In '+diff+'d';bStyle='background:#F0E0B0;color:#5A3A10';}
        else{badge=d.toLocaleDateString('en-US',{month:'short',day:'numeric'});bStyle='background:#EDE5CC;color:#4A3D1A';}
      }
      var sc = SUBJ_COLORS[t.subject]||'#EDE5CC', st = SUBJ_TEXT[t.subject]||'#4A3D1A';
      return '<div class="item-row"><div class="item-main">' +
        '<div class="circle '+(t.done?'done':'')+'" onclick="toggleLukaTask('+i+')">'+chk()+'</div>' +
        '<span class="item-text '+(t.done?'done':'')+'">'+t.title+'</span>' +
        '<span style="font-size:10px;padding:2px 7px;border-radius:20px;background:'+sc+';color:'+st+'">'+t.subject+'</span>' +
        (badge?'<span style="font-size:10px;padding:2px 7px;border-radius:20px;font-weight:500;'+bStyle+'">'+badge+'</span>':'') +
        '<button class="del-btn" onclick="deleteLukaTask('+i+')">&#215;</button>' +
        '</div></div>';
    }).join('');
  }
}

function openLukaModal() {
  document.getElementById('luka-title').value='';document.getElementById('luka-date').value='';
  document.getElementById('luka-time').value='';document.getElementById('luka-location').value='';
  document.getElementById('luka-notes').value='';
  document.getElementById('luka-modal').classList.add('open');
}
function closeLukaModal() { document.getElementById('luka-modal').classList.remove('open'); }
function saveLukaEvent() {
  var title=document.getElementById('luka-title').value.trim(); if(!title)return;
  var events=lukaEvents();
  events.push({id:Date.now(),title:title,date:document.getElementById('luka-date').value,time:document.getElementById('luka-time').value.trim(),location:document.getElementById('luka-location').value.trim(),notes:document.getElementById('luka-notes').value.trim()});
  ss('mz2_luka_events',events); closeLukaModal(); renderLuka();
}
function deleteLukaEvent(i){var e=lukaEvents();e.splice(i,1);ss('mz2_luka_events',e);renderLuka();}

function openLukaTaskModal(){
  document.getElementById('lukat-title').value='';document.getElementById('lukat-due').value='';
  document.getElementById('lukat-subject').value='General';
  document.getElementById('luka-task-modal').classList.add('open');
}
function closeLukaTaskModal(){document.getElementById('luka-task-modal').classList.remove('open');}
function saveLukaTask(){
  var title=document.getElementById('lukat-title').value.trim();if(!title)return;
  var tasks=lukaTasks();
  tasks.push({id:Date.now(),title:title,due:document.getElementById('lukat-due').value,subject:document.getElementById('lukat-subject').value,done:false});
  ss('mz2_luka_tasks',tasks);closeLukaTaskModal();renderLuka();
}
function toggleLukaTask(i){var t=lukaTasks();t[i].done=!t[i].done;ss('mz2_luka_tasks',t);renderLuka();}
function deleteLukaTask(i){var t=lukaTasks();t.splice(i,1);ss('mz2_luka_tasks',t);renderLuka();}


document.addEventListener('click', function(e) {
  var wrapper = document.getElementById('nav-menu-btn');
  var dd = document.getElementById('nav-dropdown');
  if (wrapper && dd && !wrapper.contains(e.target) && !dd.contains(e.target)) {
    wrapper.classList.remove('open');
    dd.classList.remove('open');
  }
});




// ── BUDGET ────────────────────────────────────────────────────────────────────
var budgetMonthOffset = 0;
var BUDGET_CATS = ['Groceries','Dining Out','Kids','Utilities','Home','Auto','Health','Entertainment','Shopping','Pets','Other'];
var BUDGET_CAT_COLORS = {
  'Groceries':'#4A3D1A','Dining Out':'#A0845A','Kids':'#5C6020','Utilities':'#6B5C30',
  'Home':'#8B7D50','Auto':'#7A6040','Health':'#D32F2F','Entertainment':'#1976D2',
  'Shopping':'#E91E63','Pets':'#388E3C','Other':'#757575'
};

function budgetKey(offset) {
  var d = new Date();
  d.setDate(1);
  d.setMonth(d.getMonth() + (offset || 0));
  return 'mz2_budget_' + d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0');
}
function budgetMonthLabel(offset) {
  var d = new Date();
  d.setDate(1);
  d.setMonth(d.getMonth() + (offset || 0));
  return MONTHS[d.getMonth()] + ' ' + d.getFullYear();
}
function budgetStore(offset) { return ls(budgetKey(offset)) || []; }
function prevBudgetMonth() { budgetMonthOffset--; renderBudget(); }
function nextBudgetMonth() { budgetMonthOffset++; renderBudget(); }
function openBudgetModal() {
  document.getElementById('bud-desc').value='';
  document.getElementById('bud-amount').value='';
  document.getElementById('bud-cat').value='Groceries';
  document.getElementById('bud-who').value='b';
  document.getElementById('bud-notes').value='';
  var today = new Date();
  document.getElementById('bud-date').value = today.toISOString().slice(0,10);
  document.getElementById('budget-modal').classList.add('open');
}
function closeBudgetModal() { document.getElementById('budget-modal').classList.remove('open'); }
function saveBudgetEntry() {
  var desc = document.getElementById('bud-desc').value.trim();
  var amount = parseFloat(document.getElementById('bud-amount').value);
  if (!desc || isNaN(amount) || amount <= 0) return;
  var date = document.getElementById('bud-date').value;
  if (!date) return;
  var entryDate = new Date(date + 'T12:00:00');
  var key = 'mz2_budget_' + entryDate.getFullYear() + '-' + String(entryDate.getMonth()+1).padStart(2,'0');
  var entries = ls(key) || [];
  entries.push({
    id: Date.now(),
    desc: desc,
    amount: amount,
    cat: document.getElementById('bud-cat').value,
    who: document.getElementById('bud-who').value,
    date: date,
    notes: document.getElementById('bud-notes').value.trim()
  });
  ss(key, entries);
  closeBudgetModal();
  renderBudget();
}
function delBudgetEntry(idx) {
  var entries = budgetStore(budgetMonthOffset);
  entries.splice(idx, 1);
  ss(budgetKey(budgetMonthOffset), entries);
  renderBudget();
}
function renderBudget() {
  var labelEl = document.getElementById('budget-month-label');
  if (!labelEl) return;
  labelEl.textContent = budgetMonthLabel(budgetMonthOffset);
  var entries = budgetStore(budgetMonthOffset);
  var total = 0, byCat = {}, byWho = {b:0, l:0, s:0};
  entries.forEach(function(e) {
    total += e.amount;
    byCat[e.cat] = (byCat[e.cat] || 0) + e.amount;
    byWho[e.who] = (byWho[e.who] || 0) + e.amount;
  });
  var summaryHTML = '';
  if (!entries.length) {
    summaryHTML = '<div style="font-size:12px;color:#C8B88A;padding:8px 0;font-style:italic">No expenses this month</div>';
  } else {
    summaryHTML += '<div style="display:flex;justify-content:space-between;align-items:baseline;padding:10px 0 8px;border-bottom:1px solid #EDE5CC">';
    summaryHTML += '<span style="font-size:18px;font-weight:700;color:#2A2010">$' + total.toFixed(2) + '</span>';
    summaryHTML += '<span style="font-size:11px;color:#8B7D50">' + entries.length + ' expense' + (entries.length!==1?'s':'') + '</span></div>';
    summaryHTML += '<div style="display:flex;gap:12px;padding:8px 0;border-bottom:1px solid #EDE5CC">';
    var whoLabels = {b:'Brent', l:'Lauren', s:'Both'};
    var whoColors = {b:'#4A5220', l:'#6B5C30', s:'#8B7D50'};
    ['b','l','s'].forEach(function(w) {
      if (byWho[w] > 0) {
        summaryHTML += '<div style="display:flex;align-items:center;gap:5px">';
        summaryHTML += '<span style="width:8px;height:8px;border-radius:50%;background:'+whoColors[w]+';flex-shrink:0"></span>';
        summaryHTML += '<span style="font-size:11px;color:#4A3D1A;font-weight:500">' + whoLabels[w] + '</span>';
        summaryHTML += '<span style="font-size:11px;color:#8B7D50">$' + byWho[w].toFixed(2) + '</span></div>';
      }
    });
    summaryHTML += '</div>';
    var maxCat = 0;
    BUDGET_CATS.forEach(function(c) { if ((byCat[c]||0) > maxCat) maxCat = byCat[c]; });
    summaryHTML += '<div style="padding:8px 0">';
    BUDGET_CATS.forEach(function(c) {
      var amt = byCat[c] || 0;
      if (amt <= 0) return;
      var pct = maxCat > 0 ? Math.round((amt / maxCat) * 100) : 0;
      var color = BUDGET_CAT_COLORS[c] || '#8B7D50';
      summaryHTML += '<div style="display:flex;align-items:center;gap:8px;margin-bottom:5px">';
      summaryHTML += '<span style="font-size:11px;color:#4A3D1A;width:90px;flex-shrink:0;text-align:right">' + c + '</span>';
      summaryHTML += '<div style="flex:1;height:14px;background:#EDE5CC;border-radius:7px;overflow:hidden">';
      summaryHTML += '<div style="height:100%;width:' + pct + '%;background:' + color + ';border-radius:7px;min-width:4px"></div></div>';
      summaryHTML += '<span style="font-size:11px;color:#8B7D50;width:65px;flex-shrink:0">$' + amt.toFixed(2) + '</span></div>';
    });
    summaryHTML += '</div>';
  }
  document.getElementById('budget-summary').innerHTML = summaryHTML;
  var listHTML = '';
  if (!entries.length) {
    listHTML = '<div style="font-size:12px;color:#C8B88A;padding:8px 0">No expenses yet. Tap "+ Add expense" to get started.</div>';
  } else {
    var sorted = entries.map(function(e,i){return{e:e,i:i};}).sort(function(a,b){return b.e.date.localeCompare(a.e.date);});
    sorted.forEach(function(obj) {
      var e = obj.e, idx = obj.i;
      var d = new Date(e.date + 'T12:00:00');
      var dateLbl = d.toLocaleDateString('en-US',{month:'short',day:'numeric'});
      var color = BUDGET_CAT_COLORS[e.cat] || '#8B7D50';
      listHTML += '<div class="item-row"><div class="item-main">';
      listHTML += '<span style="width:6px;height:24px;border-radius:3px;background:'+color+';flex-shrink:0"></span>';
      listHTML += '<div style="flex:1;min-width:0"><div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap">';
      listHTML += '<span style="font-size:13px;font-weight:500;color:#2A2010">' + e.desc + '</span>';
      listHTML += '<span style="font-size:10px;padding:2px 7px;border-radius:20px;background:#EDE5CC;color:#6B5C30">' + e.cat + '</span>';
      listHTML += tagHTML(e.who) + '</div>';
      listHTML += '<div style="font-size:11px;color:#8B7D50;margin-top:2px">' + dateLbl;
      if (e.notes) listHTML += ' \u00b7 ' + e.notes;
      listHTML += '</div></div>';
      listHTML += '<span style="font-size:14px;font-weight:600;color:#2A2010;flex-shrink:0;white-space:nowrap">$' + e.amount.toFixed(2) + '</span>';
      listHTML += '<button class="del-btn" onclick="delBudgetEntry(' + idx + ')">&#215;</button>';
      listHTML += '</div></div>';
    });
  }
  document.getElementById('budget-list').innerHTML = listHTML;
}
