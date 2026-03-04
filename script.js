const API = 'http://192.168.0.110:5000';
const BPM = 630;
let socket = null;
let entCache = [];
let finCache = [];
let meCache = [];
let maqCount = 0;
let configHorarios = {};

//===========MENU USUÁRIO (clique)=========//

document.addEventListener('click', (e) => {
  const usuario = document.querySelector('.usuario');
  const menu = document.querySelector('.hero-menu');
  if (!usuario || !menu) return;

  if (usuario.contains(e.target)) {
    menu.classList.toggle('aberto');
  } else {
    menu.classList.remove('aberto');
  }
});

// INIT
document.addEventListener('DOMContentLoaded', () => {
    const hoje = new Date();
    document.getElementById('dataHdr').textContent = hoje.toLocaleDateString('pt-BR',{weekday:'long',day:'numeric',month:'long'});
    document.getElementById('e-data').value = hoje.toISOString().split('T')[0];
    criarHorariosUI();
    verificarServidor();
    conectarWS();
    carregarTudo();
    setInterval(atualizarStatusLinhas, 1000);
    setInterval(atualizarCronometros, 1000);
    // Fechar autocomplete ao clicar fora
    document.addEventListener('click', (e) => {
        if(!e.target.closest('.autocomplete-wrapper')) {
            document.getElementById('me-autocomplete').classList.remove('ativo');
        }
    });
});

function aba(e,id) {
    document.querySelectorAll('.tab-content').forEach(el=>el.classList.remove('ativo'));
    document.querySelectorAll('.hero-tab').forEach(el=>el.classList.remove('ativo'));
    document.getElementById('tab-'+id).classList.add('ativo');
    e.target.classList.add('ativo');
}

// CONEXÃO
async function verificarServidor() {
    try {
        const r = await fetch(API+'/api/teste');
        setSt('srv', r.ok);
    } catch(e) { setSt('srv', false); }
}

function conectarWS() {
    try {
        socket = io(API, {reconnection:true, reconnectionDelay:1000});
        socket.on('connect', () => { setSt('ws', true); });
        socket.on('disconnect', () => setSt('ws', false));
        
        // Eventos de sincronização
        socket.on('servico_adicionado_tempo_real', () => { carregarEntrada(); sync(); });
        socket.on('servico_deletado_tempo_real', () => { carregarEntrada(); sync(); });
        socket.on('maquinas_atualizadas', (d) => { carregarMaquinas(); sync(); });
        socket.on('maquina_atualizada', (d) => { carregarMaquinas(); sync(); });
        socket.on('horarios_atualizados', (d) => { carregarHorarios(); sync(); });
        socket.on('servico_finalizado_tempo_real', () => { carregarFinalizados(); sync(); });
        socket.on('finalizado_deletado', () => { carregarFinalizados(); sync(); });
    } catch(e) { setSt('ws', false); }
}

function setSt(t, ok) {
    const el = document.getElementById('st-'+t);
    if(el) { el.classList.toggle('ok',ok); el.classList.toggle('err',!ok); }
}

function sync() { document.getElementById('i-sync').textContent = new Date().toLocaleTimeString(); }
function notif(msg, tipo='info') {
    const n = document.createElement('div');
    n.className = 'notif '+tipo;
    n.textContent = msg;
    document.body.appendChild(n);
    setTimeout(()=>n.remove(), 3000);
}

// CARREGAR TUDO
async function carregarTudo() {
    await carregarME();
    await carregarEntrada();
    await carregarHorarios();
    await carregarMaquinas();
    await carregarFinalizados();
}

// ==================== ME - MASTER ETIQUETA ====================
async function carregarME() {
    try {
        const r = await fetch(API+'/api/master-etiquetas');
        meCache = await r.json();
        renderME(meCache);
        document.getElementById('s-me-tot').textContent = meCache.length;
        const iMe = document.getElementById('i-me');
        if(iMe) iMe.textContent = meCache.length;
        const cTot = document.getElementById('cTot');
        if(cTot) cTot.textContent = meCache.length;
    } catch(e) { console.error(e); }
}

function renderME(dados) {
    const c = document.getElementById('lista-me');
    if(!dados.length) {
        c.innerHTML='<div style="text-align:center;padding:60px;color:#64748b"><div style="font-size:48px">🏷️</div><p>Nenhum ME cadastrado</p></div>';
        return;
    }
    
    // Ordenar por número do ME (extrair números e ordenar do maior para menor)
    const ordenados = [...dados].sort((a, b) => {
        const numA = parseInt((a.codigo_me || '').replace(/\D/g, '')) || 0;
        const numB = parseInt((b.codigo_me || '').replace(/\D/g, '')) || 0;
        return numB - numA; // Maior primeiro
    });
    
    // Atualizar último ME
    if(ordenados.length > 0) {
        const elUltimo = document.getElementById('ultimo-me');
        if(elUltimo) elUltimo.textContent = ordenados[0].codigo_me;
    }
    
    c.innerHTML = ordenados.map((me, idx) => {
        let dataCad = me.data_cadastro ? new Date(me.data_cadastro).toLocaleDateString('pt-BR') : '-';
        return `<div class="me-item" style="animation:fadeIn 0.25s ease ${idx*0.03}s both">
            <span class="codigo" onclick="abrirHistoricoME('${me.codigo_me}')">${me.codigo_me}</span>
            <span class="nome">${me.nome}</span>
            <span class="dim">${me.largura}</span>
            <span class="dim">${me.comprimento}</span>
            <span class="bat">${me.batidas}</span>
            <span class="data">${dataCad}</span>
            <span class="acoes">
                <button class="btn-hist" onclick="abrirHistoricoME('${me.codigo_me}')" title="Histórico"><i class="fa-solid fa-clock-rotate-left"></i></button>
                <button class="btn-edit" onclick="abrirEditarME(${me.id})" title="Editar"><i class="fa-solid fa-pen"></i></button>
                <button class="btn-del" onclick="delME(${me.id})" title="Excluir"><i class="fa-solid fa-trash"></i></button>
            </span>
        </div>`;
    }).join('');
}

function toggleListaME() {
    document.getElementById('area-lista-me').classList.toggle('ativo');
}

function filtrarME() {
    const busca = document.getElementById('busca-me').value.toLowerCase().trim();
    if(!busca) {
        renderME(meCache);
        return;
    }
    
    // Dividir em termos separados por espaço
    const termos = busca.split(/\s+/).filter(t => t.length > 0);
    
    const filtrados = meCache.filter(me => {
        // Criar string com todos os dados do ME
        const texto = [
            me.codigo_me,
            me.nome,
            me.largura,
            me.comprimento,
            me.batidas
        ].join(' ').toLowerCase();
        
        // Todos os termos devem estar presentes
        return termos.every(termo => texto.includes(termo));
    });
    
    renderME(filtrados);
}

async function addME(e) {
    e.preventDefault();
    const dados = {
        codigo_me: document.getElementById('me-codigo').value.toUpperCase().replace(/\s/g, '').trim(),
        nome: document.getElementById('me-nome').value.toUpperCase().trim(),
        largura: parseFloat(document.getElementById('me-larg').value) || 0,
        comprimento: parseFloat(document.getElementById('me-comp').value) || 0,
        batidas: parseInt(document.getElementById('me-bat').value) || 0
    };
    try {
        const r = await fetch(API+'/api/master-etiquetas', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify(dados)
        });
        if(r.ok) {
            notif('🏷️ ME cadastrado!', 'success');
            document.getElementById('formME').reset();
            document.getElementById('me-larg').value = 100;
            document.getElementById('me-comp').value = 200;
            document.getElementById('me-bat').value = 1500;
            carregarME();
        } else {
            const err = await r.json();
            notif(err.erro || 'Erro ao cadastrar', 'error');
        }
    } catch(e) { notif('❌ Erro!', 'error'); }
}

async function delME(id) {
    if(!confirm('Deletar este ME?')) return;
    try {
        await fetch(API+'/api/master-etiquetas/'+id, {method:'DELETE'});
        notif('Deletado', 'success');
        carregarME();
    } catch(e) { notif('Erro', 'error'); }
}

// Editar ME
function abrirEditarME(id) {
    const me = meCache.find(m => m.id === id);
    if(!me) return;
    
    document.getElementById('edit-me-id').value = me.id;
    document.getElementById('edit-me-titulo').textContent = me.codigo_me;
    document.getElementById('edit-me-codigo').value = me.codigo_me;
    document.getElementById('edit-me-nome').value = me.nome;
    document.getElementById('edit-me-larg').value = me.largura;
    document.getElementById('edit-me-comp').value = me.comprimento;
    document.getElementById('edit-me-bat').value = me.batidas;
    
    document.getElementById('modal-editar-me').classList.add('ativo');
}

function fecharModalEditarME() {
    document.getElementById('modal-editar-me').classList.remove('ativo');
}

async function salvarEditME(e) {
    e.preventDefault();
    const id = document.getElementById('edit-me-id').value;
    const dados = {
        nome: document.getElementById('edit-me-nome').value.toUpperCase().trim(),
        largura: parseFloat(document.getElementById('edit-me-larg').value) || 0,
        comprimento: parseFloat(document.getElementById('edit-me-comp').value) || 0,
        batidas: parseInt(document.getElementById('edit-me-bat').value) || 0
    };
    
    try {
        const r = await fetch(API+'/api/master-etiquetas/'+id, {
            method: 'PUT',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify(dados)
        });
        if(r.ok) {
            notif('✅ ME atualizado!', 'success');
            fecharModalEditarME();
            carregarME();
        } else {
            const err = await r.json();
            notif(err.erro || 'Erro ao atualizar', 'error');
        }
    } catch(e) { notif('❌ Erro!', 'error'); }
}

// Autocomplete de ME
function buscarME(termo) {
    const lista = document.getElementById('me-autocomplete');
    if (!termo || termo.length < 1) {
        lista.classList.remove('ativo');
        return;
    }
    const filtrados = meCache.filter(me =>
        me.codigo_me.toLowerCase().includes(termo.toLowerCase()) ||
        me.nome.toLowerCase().includes(termo.toLowerCase())
    ).slice(0, 10);

    if (!filtrados.length) {
        lista.classList.remove('ativo');
        return;
    }

    lista.innerHTML = filtrados.map(me => `
        <div class="autocomplete-item" onclick="selecionarME('${me.codigo_me}')">
            <span class="me-codigo">${me.codigo_me}</span>
            <span class="me-nome">${me.nome} - ${me.largura}x${me.comprimento}</span>
        </div>
    `).join('');
    lista.classList.add('ativo');
}

function selecionarME(codigo) {
    const me = meCache.find(m => m.codigo_me === codigo);
    if (me) {
        document.getElementById('e-me').value = me.codigo_me;
        document.getElementById('e-nome').value = me.nome;
        document.getElementById('e-larg').value = me.largura;
        document.getElementById('e-comp').value = me.comprimento;
        document.getElementById('e-bat').value = me.batidas;
    }
    document.getElementById('me-autocomplete').classList.remove('ativo'); var nAc=document.getElementById('nome-autocomplete'); if(nAc) nAc.classList.remove('ativo');
}

// Modal de Histórico ME
let historicoMEAtual = '';

async function abrirHistoricoME(codigoME) {
    if (!codigoME) return;
    const me = meCache.find(m => m.codigo_me === codigoME);
    if (!me) { notif('ME nao encontrado', 'error'); return; }

    historicoMEAtual = codigoME;
    document.getElementById('modal-me-codigo').textContent = codigoME;
    document.getElementById('modal-me-nome').textContent = me.nome;
    document.getElementById('modal-me-larg').textContent = me.largura;
    document.getElementById('modal-me-comp').textContent = me.comprimento;
    document.getElementById('modal-me-bat').textContent = me.batidas;

    try {
        const r = await fetch(API + '/api/historico-me/' + codigoME);
        const historico = await r.json();

        const totalProd = historico.filter(h => h.status === 'finalizado').length;
        document.getElementById('modal-me-total').textContent = totalProd + ' vez(es)';

        const lista = document.getElementById('historico-lista');
        if (!historico.length) {
            lista.innerHTML = '<div class="hist-vazio"><i class="fa-solid fa-clock-rotate-left"></i><p>Nenhum historico encontrado</p></div>';
        } else {
            lista.innerHTML = historico.map(h => {
                let dataEnt = '-';
                if (h.data_entrada) {
                    const de = h.data_entrada.split('T')[0].split('-');
                    if (de.length === 3) dataEnt = de[2] + '/' + de[1] + '/' + de[0];
                }
                let dataIni = '-';
                if (h.data_inicio) {
                    const di = new Date(h.data_inicio);
                    dataIni = di.toLocaleDateString('pt-BR') + ' ' + di.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
                }
                let dataFim = '-';
                if (h.data_fim) {
                    const df = new Date(h.data_fim);
                    dataFim = df.toLocaleDateString('pt-BR') + ' ' + df.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
                }
                return `<div class="hist-item">
                    <span class="hist-maq">M${h.maquina || '-'}</span>
                    <span class="hist-data"><i class="fa-solid fa-right-to-bracket"></i> ${dataEnt}</span>
                    <span class="hist-data"><i class="fa-solid fa-play"></i> ${dataIni}</span>
                    <span class="hist-data"><i class="fa-solid fa-flag-checkered"></i> ${dataFim}</span>
                    <button class="btn-excluir btn-hist-del" onclick="delHistoricoME(${h.id})" title="Apagar"><i class="fa-solid fa-trash"></i></button>
                </div>`;
            }).join('');
        }
    } catch (e) {
        document.getElementById('historico-lista').innerHTML = '<p style="color:#dc2626;text-align:center;padding:20px">Erro ao carregar historico</p>';
    }

    document.getElementById('modal-historico-me').classList.add('ativo');
}

async function delHistoricoME(id) {
    if (!confirm('Apagar este registro do historico?')) return;
    try {
        const r = await fetch(API + '/api/historico-me/item/' + id, { method: 'DELETE' });
        if (r.ok) {
            notif('Registro apagado!', 'success');
            abrirHistoricoME(historicoMEAtual);
        } else {
            notif('Erro ao apagar', 'error');
        }
    } catch (e) { notif('Erro!', 'error'); }
}

function fecharModalHistorico() {
    document.getElementById('modal-historico-me').classList.remove('ativo');
}

// ==================== ENTRADA ====================
async function carregarEntrada() {
    try {
        const r = await fetch(API + '/api/servicos-entrada');
        entCache = await r.json();
        renderEnt(entCache);
        atualizarStatsEnt(entCache);
    } catch (e) { console.error('Erro ao carregar entrada:', e); }
}

let filtroTipoAtual = 'todos';

function renderEnt(dados) {
    const c = document.getElementById('lista-ent');
    if (!dados.length) {
        c.innerHTML = `<div class="ent-vazio">
            <i class="fa-solid fa-inbox"></i>
            <p>Nenhum serviço na fila</p>
            <span>Adicione um serviço ao lado para começar</span>
        </div>`;
        return;
    }

    // Ordenar por data
    const ordenados = [...dados].sort((a, b) => {
        const dataA = new Date(a.data_entrada || '9999-12-31');
        const dataB = new Date(b.data_entrada || '9999-12-31');
        return dataA - dataB;
    });

    // Filtrar por tipo
    const filtrados = ordenados.filter(s => {
        if (filtroTipoAtual === 'todos') return true;
        return s.tipo_fabric.toLowerCase() === filtroTipoAtual;
    });

    if (!filtrados.length) {
        c.innerHTML = `<div class="ent-vazio">
            <i class="fa-solid fa-filter"></i>
            <p>Nenhum serviço ${filtroTipoAtual.toUpperCase()}</p>
            <span>Não há serviços deste tipo na fila</span>
        </div>`;
        return;
    }

    c.innerHTML = filtrados.map((s, idx) => {
        const t = calcTempo(s.unidades, s.batidas);
        let dataEnt = '-';
        if (s.data_entrada) {
            const partes = s.data_entrada.split('-');
            if (partes.length === 3) dataEnt = partes[2] + '/' + partes[1] + '/' + partes[0].slice(2);
        }
        const tipoClass = s.tipo_fabric.toLowerCase();
        const meHtml = s.codigo_me ? `<span class="col-me col-me-link" onclick="abrirHistoricoME('${s.codigo_me}')">${s.codigo_me}</span>` : '<span style="color:#cbd5e1">—</span>';

        return `<div class="ent-item ${tipoClass}" style="animation:fadeIn 0.2s ease ${idx * 0.03}s both">
            ${meHtml}
            <span class="col-nome" title="${s.nome_servico}">${s.nome_servico}</span>
            <span class="col-tipo"><span class="ent-badge ${tipoClass}">${s.tipo_fabric}</span></span>
            <span class="col-dim">${s.largura}</span>
            <span class="col-dim">${s.comprimento}</span>
            <span class="col-num">${s.batidas}</span>
            <span class="col-num">${s.unidades}</span>
            <span class="col-tempo">⏱${t}</span>
            <span class="col-data">${dataEnt}</span>
            <span class="col-acoes">
                <button class="btn-enviar" onclick="enviarMaq(${s.id})" title="Enviar para máquina"><i class="fa-solid fa-paper-plane"></i></button>
                <button class="btn-excluir" onclick="delEnt(${s.id})" title="Excluir"><i class="fa-solid fa-trash"></i></button>
            </span>
        </div>`;
    }).join('');
}

function setFiltroTipo(tipo) {
    filtroTipoAtual = tipo;
    document.querySelectorAll('.ent-filtro').forEach(btn => {
        btn.classList.toggle('ativo', btn.dataset.filtro === tipo);
    });
    const info = document.getElementById('filtro-info');
    if (info) {
        const nomes = { todos: 'Todos', fbr: 'FBR', fpt: 'FPT' };
        info.textContent = 'Mostrando: ' + (nomes[tipo] || tipo);
    }
    renderEnt(entCache);
}

function formatarHorasMin(minutos) {
    const h = Math.floor(minutos / 60);
    const m = Math.floor(minutos % 60);
    return h > 0 ? h + 'h' + (m > 0 ? m + 'm' : '') : m + 'm';
}

function atualizarStatsEnt(dados) {
    let tot = 0, fbr = 0, fpt = 0, tMin = 0, fbrMin = 0, fptMin = 0;
    dados.forEach(s => {
        const m = (s.unidades * s.batidas) / BPM;
        tot++; tMin += m;
        if (s.tipo_fabric === 'FBR') { fbr++; fbrMin += m; }
        else { fpt++; fptMin += m; }
    });
    document.getElementById('s-tot').textContent = tot;
    document.getElementById('s-tot-h').textContent = formatarHorasMin(tMin);
    document.getElementById('s-fbr').textContent = fbr;
    document.getElementById('s-fbr-h').textContent = formatarHorasMin(fbrMin);
    document.getElementById('s-fpt').textContent = fpt;
    document.getElementById('s-fpt-h').textContent = formatarHorasMin(fptMin);
}

async function addEntrada(e) {
    e.preventDefault();
    const meVal = document.getElementById('e-me').value.toUpperCase().replace(/\s/g, '').trim();
    const dados = {
        codigo_me: meVal || null,
        nome_servico: document.getElementById('e-nome').value.toUpperCase().trim(),
        tipo_fabric: document.getElementById('e-tipo').value.toUpperCase().trim(),
        largura: parseFloat(document.getElementById('e-larg').value) || 0,
        comprimento: parseFloat(document.getElementById('e-comp').value) || 0,
        batidas: parseInt(document.getElementById('e-bat').value) || 0,
        unidades: parseInt(document.getElementById('e-un').value) || 0,
        data_entrada: document.getElementById('e-data').value
    };
    try {
        const r = await fetch(API + '/api/servicos-entrada', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(dados)
        });
        if (r.ok) {
            notif('Serviço adicionado!', 'success');
            document.getElementById('formEnt').reset();
            document.getElementById('e-data').value = new Date().toISOString().split('T')[0];
            document.getElementById('e-larg').value = 100;
            document.getElementById('e-comp').value = 200;
            document.getElementById('e-bat').value = 1500;
            document.getElementById('e-un').value = 250;
            carregarEntrada();
        }
    } catch (e) { notif('Erro ao adicionar!', 'error'); }
}

async function delEnt(id) {
    if (!confirm('Deletar este serviço?')) return;
    try {
        await fetch(API + '/api/servicos-entrada/' + id, { method: 'DELETE' });
        notif('Serviço removido', 'success');
        carregarEntrada();
    } catch (e) { notif('Erro ao remover', 'error'); }
}

function filtrarEnt() {
    const busca = document.getElementById('busca-ent').value.toLowerCase().trim();
    if (!busca) { renderEnt(entCache); return; }
    const termos = busca.split(/\s+/).filter(t => t.length > 0);
    const filtrados = entCache.filter(s => {
        const campos = [
            s.codigo_me || '', s.nome_servico || '',
            String(s.largura || ''), String(s.comprimento || ''),
            String(s.batidas || ''), String(s.unidades || ''),
            s.tipo_fabric || '', `${s.largura}x${s.comprimento}`
        ].join(' ').toLowerCase();
        return termos.every(t => campos.includes(t));
    });
    renderEnt(filtrados);
}

function calcTempo(un,bat) {
    const m=(un*bat)/BPM,h=Math.floor(m/60),mi=Math.floor(m%60);
    return h>0?h+'h'+mi+'m':mi+'m';
}

// HORÁRIOS
function criarHorariosUI() {
    const dias=[{k:'seg',n:'Seg'},{k:'ter',n:'Ter'},{k:'qua',n:'Qua'},{k:'qui',n:'Qui'},{k:'sex',n:'Sex'},{k:'sab',n:'Sáb'},{k:'dom',n:'Dom'}];
    const g=document.getElementById('horarios-grid');
    dias.forEach(d => {
        const ck=d.k!=='dom'?'checked':'';
        const dis=d.k==='dom'?'disabled':'';
        const ina=d.k==='dom'?'inativo':'';
        g.innerHTML+=`<div class="dia-config ${ina}" id="cfg-${d.k}"><label><input type="checkbox" id="${d.k}-at" ${ck} onchange="toggleDia('${d.k}')" style="margin-right:6px">${d.n}</label><div class="horario-inputs"><div class="horario-linha"><div class="horario-campo"><label>Início</label><input type="time" id="${d.k}-ini" value="06:00" ${dis}></div><div class="horario-campo"><label>Fim</label><input type="time" id="${d.k}-fim" value="${d.k==='sab'?'14:00':'18:00'}" ${dis}></div></div><div class="horario-linha"><div class="horario-campo"><label>Pausa</label><input type="time" id="${d.k}-pi" value="12:00" ${dis}></div><div class="horario-campo"><label>Até</label><input type="time" id="${d.k}-pf" value="13:00" ${dis}></div></div></div></div>`;
    });
}

function toggleDia(d) {
    const cb=document.getElementById(d+'-at'),cfg=document.getElementById('cfg-'+d),inputs=cfg.querySelectorAll('input[type="time"]');
    if(cb.checked){cfg.classList.remove('inativo');inputs.forEach(i=>i.disabled=false);}
    else{cfg.classList.add('inativo');inputs.forEach(i=>i.disabled=true);}
}

async function carregarHorarios() {
    try {
        const r=await fetch(API+'/api/configuracao-horarios');
        const cfg=await r.json();
        configHorarios=cfg;
        ['seg','ter','qua','qui','sex','sab','dom'].forEach(d => {
            if(cfg[d]) {
                document.getElementById(d+'-at').checked=cfg[d].ativo;
                document.getElementById(d+'-ini').value=cfg[d].inicio;
                document.getElementById(d+'-fim').value=cfg[d].fim;
                document.getElementById(d+'-pi').value=cfg[d].pausaInicio;
                document.getElementById(d+'-pf').value=cfg[d].pausaFim;
                toggleDia(d);
            }
        });
    } catch(e) { console.error(e); }
}

async function salvarHorarios() {
    const cfg={};
    ['seg','ter','qua','qui','sex','sab','dom'].forEach(d => {
        cfg[d]={
            ativo:document.getElementById(d+'-at').checked,
            inicio:document.getElementById(d+'-ini').value,
            fim:document.getElementById(d+'-fim').value,
            pausaInicio:document.getElementById(d+'-pi').value,
            pausaFim:document.getElementById(d+'-pf').value
        };
    });
    try {
        await fetch(API+'/api/configuracao-horarios',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(cfg)});
        notif('Horários salvos!','success');
        document.querySelectorAll('.maquina').forEach(m=>recalcMaq(m));
    } catch(e) { notif('Erro','error'); }
}

// MÁQUINAS
async function carregarMaquinas() {
    try {
        const r=await fetch(API+'/api/maquinas-estado');
        const estado=await r.json();
        const container=document.getElementById('maquinas-container');
        container.innerHTML='';
        maqCount=0;
        
        const nums=Object.keys(estado).map(n=>parseInt(n)).sort((a,b)=>a-b);
        if(nums.length===0) { for(let i=1;i<=4;i++)criarMaqUI(i); }
        else {
            nums.forEach(num => {
                criarMaqUI(num);
                const maq=document.querySelector(`.maquina[data-n="${num}"]`);
                if(maq && estado[num]) {
                    maq.querySelector('.bpm-maq').value=estado[num].bpm||BPM;
                    (estado[num].servicos||[]).forEach(sv=>addLinhaComDados(maq,sv));
                    recalcMaq(maq);
                    atualizarBtns(maq);
                }
            });
        }
    } catch(e) { console.error(e); for(let i=1;i<=4;i++)criarMaqUI(i); }
}

function criarMaqUI(num) {
    maqCount=Math.max(maqCount,num);
    const c=document.getElementById('maquinas-container');
    const d=document.createElement('div');
    d.className='maquina';
    d.dataset.n=num;
    d.innerHTML=`<div class="maquina-header"><span class="maquina-titulo">🏭 MÁQUINA ${num}</span><div style="display:flex;align-items:center;gap:8px"><label style="font-size:12px">RPM:</label><input type="number" class="bpm-maq" value="${BPM}" style="width:65px;text-align:center" onchange="recalcMaq(this.closest('.maquina'));salvarMaq(this.closest('.maquina'))"><button onclick="remMaq(this)" class="btn-perigo" style="width:26px;height:26px;border-radius:50%;padding:0">X</button></div></div><div class="servicos-maq"></div><div style="margin-top:10px;display:flex;gap:8px"><button class="add-btn" onclick="addLinha(this,${num})">➕ Serviço</button><button class="add-btn btn-laranja" onclick="addProx(this,${num})">⏭️ Próximo</button></div><div class="resultado"><div class="tempo-info"><span style="opacity:0.7">TOTAL:</span> <span class="tt">0</span> <span style="margin:0 15px;color:#4a5568">│</span> <span style="opacity:0.7">⏱️ RESTANTE:</span> <span class="tr" style="color:#f6e05e;font-weight:bold">--</span><span class="codigo-parada-display" style="display:none;margin-left:15px"></span></div></div>`;
    c.appendChild(d);
}

function addMaquina() {
    maqCount++;
    criarMaqUI(maqCount);
    salvarMaq(document.querySelector(`.maquina[data-n="${maqCount}"]`));
    notif('Máquina '+maqCount+' adicionada!','success');
}

async function remMaq(btn) {
    if(!confirm('Remover máquina?')) return;
    const maq=btn.closest('.maquina');
    const num=maq.dataset.n;
    maq.remove();
    // Salvar estado vazio para esta máquina (ou poderia deletar)
    try {
        await fetch(API+'/api/maquinas-estado/'+num,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({bpm:630,servicos:[]})});
    } catch(e) {}
    notif('Removida','success');
}

function addLinha(btn,num) {
    const maq=btn.closest('.maquina');
    const div=maq.querySelector('.servicos-maq');
    const agora = new Date();
    // Formatar data/hora atual no formato brasileiro
    const dia = String(agora.getDate()).padStart(2,'0');
    const mes = String(agora.getMonth()+1).padStart(2,'0');
    const ano = agora.getFullYear();
    const hora = String(agora.getHours()).padStart(2,'0');
    const min = String(agora.getMinutes()).padStart(2,'0');
    const dataFmt = dia + '/' + mes + '/' + ano;
    const horaFmt = hora + ':' + min;
    const isoDataHora = ano + '-' + mes + '-' + dia + 'T' + hora + ':' + min;
    const isoData = ano + '-' + mes + '-' + dia;
    
    const linha=document.createElement('div');
    linha.className='linha pendente';
    linha.innerHTML=`<label>ME:</label><input type="text" class="codigo-me" style="width:60px" placeholder="ME"><label>Nome:</label><input type="text" class="nome" style="width:85px"><label>L:</label><input type="text" class="larg num" style="width:50px" inputmode="numeric"><label>C:</label><input type="text" class="comp num" style="width:50px" inputmode="numeric"><label>Bat:</label><input type="text" class="bat num" value="1500" style="width:50px" inputmode="numeric"><label>Original:</label><input type="text" class="un-original num" value="" readonly style="width:50px;background:#e8f5e9;color:#27ae60;font-weight:bold" inputmode="numeric"><label>Restante:</label><input type="text" class="un num" style="width:50px" inputmode="numeric"><label>Faltam:</label><input type="text" class="faltam" readonly style="width:50px"><label>Tempo:</label><input type="text" class="tempo" readonly style="width:50px"><label>Data:</label><input type="text" class="hi-data-txt" value="${dataFmt}" placeholder="DD/MM/AAAA" style="width:85px"><label>Hora:</label><input type="text" class="hi-hora-txt" value="${horaFmt}" placeholder="HH:MM" style="width:50px"><input type="hidden" class="hi" value="${isoDataHora}"><label>Fim:</label><input type="text" class="hf fim" readonly style="width:95px"><label>Ent:</label><input type="text" class="de-texto" value="${dataFmt}" placeholder="DD/MM/AAAA" style="width:85px"><input type="hidden" class="de" value="${isoData}"><button class="lb up" onclick="moverUp(this)">▲</button><button class="lb down" onclick="moverDown(this)">▼</button><button class="lb pause" onclick="togglePause(this)">⏸</button><button class="lb check" onclick="finalizar(this)">✓</button><button class="lb ret" onclick="retornar(this)">↩</button><button class="lb rem" onclick="remLinha(this)">X</button>`;
    div.appendChild(linha);
    
    // Configurar sincronização dos campos de texto
    const hiDataTxt = linha.querySelector('.hi-data-txt');
    const hiHoraTxt = linha.querySelector('.hi-hora-txt');
    const hiHidden = linha.querySelector('.hi');
    const deTexto = linha.querySelector('.de-texto');
    const deHidden = linha.querySelector('.de');
    
    function parseDataBR(str) {
        if(!str) return '';
        const [d, m, a] = str.trim().split('/');
        if(!d || !m || !a) return '';
        return a + '-' + m.padStart(2,'0') + '-' + d.padStart(2,'0');
    }
    
    function syncHi() {
        const dataStr = hiDataTxt.value.trim();
        const horaStr = hiHoraTxt.value.trim();
        if(dataStr && horaStr) {
            const dataISO = parseDataBR(dataStr);
            if(dataISO) {
                hiHidden.value = dataISO + 'T' + horaStr;
            }
        }
        recalcMaq(maq);salvarMaq(maq);
    }
    
    function syncDe() {
        const iso = parseDataBR(deTexto.value);
        if(iso) deHidden.value = iso;
        salvarMaq(maq);
    }
    
    hiDataTxt.addEventListener('change', syncHi);
    hiDataTxt.addEventListener('blur', syncHi);
    hiHoraTxt.addEventListener('change', syncHi);
    hiHoraTxt.addEventListener('blur', syncHi);
    deTexto.addEventListener('change', syncDe);
    deTexto.addEventListener('blur', syncDe);
    
    // Usar blur em vez de input para não interromper digitação
    linha.querySelectorAll('input:not([readonly]):not(.hi-data-txt):not(.hi-hora-txt):not(.hi):not(.de-texto):not(.de)').forEach(i=>{
        i.addEventListener('blur',()=>{recalcMaq(maq);salvarMaq(maq);});
        i.addEventListener('change',()=>{recalcMaq(maq);salvarMaq(maq);});
    });
    recalcMaq(maq);atualizarBtns(maq);salvarMaq(maq);
}

function addLinhaComDados(maq,sv) {
    const div=maq.querySelector('.servicos-maq');
    const linha=document.createElement('div');
    linha.className='linha pendente';
    if(sv.pausado) linha.classList.add('pausado');
    // Separar data e hora do horarioInicio
    let dataIni = '', horaIni = '';
    if(sv.horarioInicio) {
        const dt = new Date(sv.horarioInicio);
        if(!isNaN(dt.getTime())) {
            // Usar métodos locais em vez de toISOString (que converte para UTC)
            const ano = dt.getFullYear();
            const mes = String(dt.getMonth() + 1).padStart(2, '0');
            const dia = String(dt.getDate()).padStart(2, '0');
            const hora = String(dt.getHours()).padStart(2, '0');
            const min = String(dt.getMinutes()).padStart(2, '0');
            dataIni = ano + '-' + mes + '-' + dia;
            horaIni = hora + ':' + min;
        }
    }
    // Formatar data e hora para exibição texto (DD/MM/AAAA HH:MM)
    let dataHoraIni = '';
    if(dataIni && horaIni) {
        const [ano, mes, dia] = dataIni.split('-');
        dataHoraIni = dia + '/' + mes + '/' + ano + ' ' + horaIni;
    }
    // Formatar data entrada para texto
    let dataEntFmt = '';
    if(sv.dataEntrada) {
        const [ano, mes, dia] = sv.dataEntrada.split('-');
        dataEntFmt = dia + '/' + mes + '/' + ano;
    }
    // Separar data e hora para campos distintos
    let dataIniFmt = '', horaIniFmt = '';
    if(dataIni && horaIni) {
        const [ano, mes, dia] = dataIni.split('-');
        dataIniFmt = dia + '/' + mes + '/' + ano;
        horaIniFmt = horaIni;
    }
    linha.innerHTML=`<label>ME:</label><input type="text" class="codigo-me" value="${sv.codigoME||''}" style="width:60px;cursor:pointer;background:#f3e8ff;border-color:#9b59b6;color:#9b59b6;font-weight:bold" placeholder="ME" readonly onclick="abrirHistoricoME(this.value)"><label>Nome:</label><input type="text" class="nome" value="${sv.nome||''}" style="width:100px"><label>L:</label><input type="text" class="larg num" value="${sv.largura||''}" style="width:50px" inputmode="numeric"><label>C:</label><input type="text" class="comp num" value="${sv.comprimento||''}" style="width:50px" inputmode="numeric"><label>Bat:</label><input type="text" class="bat num" value="${sv.batidas||1500}" style="width:50px" inputmode="numeric"><label>Original:</label><input type="text" class="un-original num" value="${sv.unidadesOriginal||sv.unidades||''}" readonly style="width:50px;background:#e8f5e9;color:#27ae60;font-weight:bold" inputmode="numeric"><label>Restante:</label><input type="text" class="un num" value="${sv.unidades||''}" style="width:50px" inputmode="numeric"><label>Faltam:</label><input type="text" class="faltam" readonly style="width:50px"><label>Tempo:</label><input type="text" class="tempo" readonly style="width:50px"><label>Data:</label><input type="text" class="hi-data-txt" value="${dataIniFmt}" placeholder="DD/MM/AAAA" style="width:85px"><label>Hora:</label><input type="text" class="hi-hora-txt" value="${horaIniFmt}" placeholder="HH:MM" style="width:50px"><input type="hidden" class="hi" value="${sv.horarioInicio||''}"><input type="hidden" class="codigo-pausa" value="${sv.codigoPausa||''}"><input type="hidden" class="data-envio-maquina" value="${sv.dataEnvioMaquina||''}"><input type="hidden" class="unidades-original" value="${sv.unidadesOriginal||sv.unidades||''}"><label>Fim:</label><input type="text" class="hf fim" readonly style="width:95px"><label>Ent:</label><input type="text" class="de-texto" value="${dataEntFmt}" placeholder="DD/MM/AAAA" style="width:85px"><input type="hidden" class="de" value="${sv.dataEntrada||''}"><button class="lb up" onclick="moverUp(this)">▲</button><button class="lb down" onclick="moverDown(this)">▼</button><button class="lb ${sv.pausado?'play':'pause'}" onclick="togglePause(this)">${sv.pausado?'▶':'⏸'}</button><button class="lb check" onclick="finalizar(this)">✓</button><button class="lb ret" onclick="retornar(this)">↩</button><button class="lb rem" onclick="remLinha(this)">X</button>`;
    
    // Carregar pauseStart se existir
    if(sv.pauseStart) {
        linha.dataset.pauseStart = sv.pauseStart;
    }
    
    div.appendChild(linha);
    // Sincronizar campos de data e hora separados com o hidden
    const hiDataTxt = linha.querySelector('.hi-data-txt');
    const hiHoraTxt = linha.querySelector('.hi-hora-txt');
    const hiHidden = linha.querySelector('.hi');
    const deTexto = linha.querySelector('.de-texto');
    const deHidden = linha.querySelector('.de');
    
    // Função para converter DD/MM/AAAA para AAAA-MM-DD
    function parseDataBR(str) {
        if(!str) return '';
        const [dia, mes, ano] = str.trim().split('/');
        if(!dia || !mes || !ano) return '';
        return ano + '-' + mes.padStart(2,'0') + '-' + dia.padStart(2,'0');
    }
    
    function syncHi() {
        const dataStr = hiDataTxt.value.trim();
        const horaStr = hiHoraTxt.value.trim();
        if(dataStr && horaStr) {
            const dataISO = parseDataBR(dataStr);
            if(dataISO) {
                hiHidden.value = dataISO + 'T' + horaStr;
            }
        }
        const maqAtual = linha.closest('.maquina');
        recalcMaq(maqAtual);
        salvarMaq(maqAtual);
    }
    
    function syncDe() {
        const iso = parseDataBR(deTexto.value);
        if(iso) {
            deHidden.value = iso;
        }
        const maqAtual = linha.closest('.maquina');
        salvarMaq(maqAtual);
    }
    
    hiDataTxt.addEventListener('change', syncHi);
    hiDataTxt.addEventListener('blur', syncHi);
    hiHoraTxt.addEventListener('change', syncHi);
    hiHoraTxt.addEventListener('blur', syncHi);
    deTexto.addEventListener('change', syncDe);
    deTexto.addEventListener('blur', syncDe);
    
    // Usar blur em vez de input para não interromper digitação
    linha.querySelectorAll('input:not([readonly]):not(.hi-data-txt):not(.hi-hora-txt):not(.hi):not(.de-texto):not(.de)').forEach(i=>{
        i.addEventListener('blur',()=>{
            const maqAtual = i.closest('.maquina');
            recalcMaq(maqAtual);
            salvarMaq(maqAtual);
        });
        i.addEventListener('change',()=>{
            const maqAtual = i.closest('.maquina');
            recalcMaq(maqAtual);
            salvarMaq(maqAtual);
        });
    });
}

function addProx(btn,num) {
    const maq=btn.closest('.maquina');
    const linhas=maq.querySelectorAll('.linha');
    addLinha(btn,num);
    if(linhas.length>0) {
        const ult=linhas[linhas.length-1];
        const fim=ult.querySelector('.hf').value;
        if(fim&&!fim.includes('Inv')) {
            const novas=maq.querySelectorAll('.linha');
            const nova=novas[novas.length-1];
            const [dp,hp]=fim.split(' ');
            if(dp&&hp) {
                const [dia,mes]=dp.split('/');
                const [hora,min]=hp.split(':');
                const df=new Date(new Date().getFullYear(),parseInt(mes)-1,parseInt(dia),parseInt(hora),parseInt(min));
                df.setMinutes(df.getMinutes()+10);
                // Atualizar hidden com formato ISO local
                const ano = df.getFullYear();
                const m = String(df.getMonth()+1).padStart(2,'0');
                const d = String(df.getDate()).padStart(2,'0');
                const h = String(df.getHours()).padStart(2,'0');
                const mi = String(df.getMinutes()).padStart(2,'0');
                nova.querySelector('.hi').value = ano + '-' + m + '-' + d + 'T' + h + ':' + mi;
                // Atualizar campos texto visíveis separados
                const hiDataTxt = nova.querySelector('.hi-data-txt');
                const hiHoraTxt = nova.querySelector('.hi-hora-txt');
                if(hiDataTxt) hiDataTxt.value = d + '/' + m + '/' + ano;
                if(hiHoraTxt) hiHoraTxt.value = h + ':' + mi;
            }
        }
    }
    // Recalcular para atualizar campos de fim
    recalcMaq(maq);
}

function enviarMaq(id) {
    notif('Função enviarMaq será integrada no sistema principal', 'info');
}

function remLinha(btn){if(!confirm('Remover?'))return;const l=btn.closest('.linha'),m=l.closest('.maquina');l.remove();recalcMaq(m);atualizarBtns(m);salvarMaq(m);notif('Removido','success');}
function moverUp(btn){const l=btn.closest('.linha'),a=l.previousElementSibling;if(a&&a.classList.contains('linha')){l.parentNode.insertBefore(l,a);atualizarBtns(l.closest('.maquina'));salvarMaq(l.closest('.maquina'));}}
function moverDown(btn){const l=btn.closest('.linha'),p=l.nextElementSibling;if(p&&p.classList.contains('linha')){l.parentNode.insertBefore(p,l);atualizarBtns(l.closest('.maquina'));salvarMaq(l.closest('.maquina'));}}
function atualizarBtns(maq){const ls=maq.querySelectorAll('.linha');ls.forEach((l,i)=>{const u=l.querySelector('.up'),d=l.querySelector('.down');if(u)u.disabled=(i===0);if(d)d.disabled=(i===ls.length-1);});}
// Variáveis para modal de pausa no index
let pausaLinhaIndex = null;
let pausaMaqIndex = null;

function togglePause(btn){
    const l=btn.closest('.linha');
    const maq=l.closest('.maquina');
    const isPaused=btn.classList.contains('play'); // está pausado (mostrando play)
    
    if(isPaused){
        // DAR PLAY - Retomar serviço
        // Calcular quanto tempo ficou pausado
        const tempoPausado = l.dataset.pauseTime ? parseInt(l.dataset.pauseTime) : 0;
        const agora = new Date();
        const inicioPausa = l.dataset.pauseStart ? new Date(parseInt(l.dataset.pauseStart)) : null;
        
        if(inicioPausa) {
            const msPausado = agora - inicioPausa;
            // Ajustar o horário de início do serviço (empurrar para frente pelo tempo pausado)
            const hiHidden = l.querySelector('.hi');
            const hiDataTxt = l.querySelector('.hi-data-txt');
            const hiHoraTxt = l.querySelector('.hi-hora-txt');
            
            if(hiHidden && hiHidden.value) {
                const inicioOriginal = new Date(hiHidden.value);
                const novoInicio = new Date(inicioOriginal.getTime() + msPausado);
                
                // Atualizar hidden com fuso local
                const ano = novoInicio.getFullYear();
                const mes = String(novoInicio.getMonth() + 1).padStart(2, '0');
                const dia = String(novoInicio.getDate()).padStart(2, '0');
                const hora = String(novoInicio.getHours()).padStart(2, '0');
                const min = String(novoInicio.getMinutes()).padStart(2, '0');
                hiHidden.value = ano + '-' + mes + '-' + dia + 'T' + hora + ':' + min;
                
                // Atualizar campos texto visíveis separados
                if(hiDataTxt) hiDataTxt.value = dia + '/' + mes + '/' + ano;
                if(hiHoraTxt) hiHoraTxt.value = hora + ':' + min;
            }
        }
        
        // Limpar dados de pausa
        delete l.dataset.pauseStart;
        delete l.dataset.pauseTime;
        
        // Limpar código de pausa
        const codigoPausaInput = l.querySelector('.codigo-pausa');
        if(codigoPausaInput) codigoPausaInput.value = '';
        
        btn.innerHTML='⏸';
        btn.classList.remove('play');
        btn.classList.add('pause');
        l.classList.remove('pausado');
        
        // Recalcular toda a máquina (vai recalcular próximos serviços)
        recalcMaq(maq);
        salvarMaq(maq);
        notif('▶️ Retomado!', 'success');
    } else {
        // PAUSAR - Abrir modal para escolher código
        pausaLinhaIndex = l;
        pausaMaqIndex = maq;
        document.getElementById('modal-parada-index').classList.add('ativo');
    }
}

function fecharModalPausaIndex() {
    document.getElementById('modal-parada-index').classList.remove('ativo');
    pausaLinhaIndex = null;
    pausaMaqIndex = null;
}

function confirmarPausaIndex(codigo) {
    if(!pausaLinhaIndex || !pausaMaqIndex) return;
    
    const l = pausaLinhaIndex;
    const maq = pausaMaqIndex;
    const btn = l.querySelector('.lb.pause, .lb.play');
    
    // Guardar momento da pausa
    l.dataset.pauseStart = Date.now().toString();
    
    // Salvar código de pausa
    const codigoPausaInput = l.querySelector('.codigo-pausa');
    if(codigoPausaInput) codigoPausaInput.value = codigo;
    
    btn.innerHTML='▶';
    btn.classList.remove('pause');
    btn.classList.add('play');
    l.classList.add('pausado');
    
    salvarMaq(maq);
    atualizarStatusLinhas();
    
    const nomes = {1: 'Preparação de Urdume', 3: 'Manutenção Programada', 4: 'Parada Técnica', 5: 'Ajuste de Programa', 6: 'Amostra Qualidade', 7: 'Limitação de Equipe Operacional', 8: 'Serviço Insuficiente'};
    notif('⏸️ ' + nomes[codigo], 'info');
    
    fecharModalPausaIndex();
}

async function finalizar(btn) {
    if(!confirm('Finalizar?')) return;
    const l=btn.closest('.linha'),m=l.closest('.maquina'),num=m.dataset.n;
    const meInput = l.querySelector('.codigo-me');
    const dataEnvioInput = l.querySelector('.data-envio-maquina');
    const codigoME = meInput ? meInput.value.toUpperCase().replace(/\s/g, '').trim() : '';
    const dataEnvioMaquina = dataEnvioInput ? dataEnvioInput.value : '';
    const agora = new Date().toISOString();
    const dataEntrada = l.querySelector('.de').value;
    const dados={codigoME:codigoME||null,nome:l.querySelector('.nome').value.toUpperCase().trim(),largura:l.querySelector('.larg').value,comprimento:l.querySelector('.comp').value,batidas:l.querySelector('.bat').value,unidades:l.querySelector('.un').value,tempo:l.querySelector('.tempo').value,horarioInicio:dataEnvioMaquina||l.querySelector('.hi').value,horarioFim:l.querySelector('.hf').value,maquina:num,dataEntrada:dataEntrada,dataFinalizacao:agora};
    try {
        await fetch(API+'/api/servicos-finalizados',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(dados)});
        
        // Atualizar histórico ME com data de término
        if(codigoME) {
            fetch(API+'/api/historico-me/finalizar', {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({
                    codigo_me: codigoME,
                    maquina: num,
                    data_entrada: dataEntrada,
                    data_inicio: dataEnvioMaquina||l.querySelector('.hi').value,
                    data_fim: agora
                })
            }).catch(e => console.error('Erro ao atualizar histórico ME:', e));
        }
        
        l.remove();recalcMaq(m);atualizarBtns(m);salvarMaq(m);
        notif('✅ Finalizado!','success');
        carregarFinalizados();
    } catch(e) { notif('Erro','error'); }
}

async function retornar(btn) {
    if(!confirm('Retornar?')) return;
    const l=btn.closest('.linha'),m=l.closest('.maquina');
    const meInput = l.querySelector('.codigo-me');
    const codigoME = meInput ? meInput.value.toUpperCase().replace(/\s/g, '').trim() : '';
    const dados={codigo_me:codigoME||null,nome_servico:l.querySelector('.nome').value.toUpperCase().trim(),tipo_fabric:'FBR',largura:parseFloat(l.querySelector('.larg').value)||0,comprimento:parseFloat(l.querySelector('.comp').value)||0,batidas:parseInt(l.querySelector('.bat').value)||0,unidades:parseInt(l.querySelector('.un').value)||0,data_entrada:l.querySelector('.de').value};
    try {
        const r=await fetch(API+'/api/servicos-entrada',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(dados)});
        if(r.ok){l.remove();recalcMaq(m);atualizarBtns(m);salvarMaq(m);carregarEntrada();notif('↩ Retornou','success');}
    } catch(e) { notif('Erro','error'); }
}

async function salvarMaq(maq) {
    const num=maq.dataset.n;
    const bpm=maq.querySelector('.bpm-maq').value;
    const servicos=[];
    maq.querySelectorAll('.linha').forEach(l=>{
        const meInput = l.querySelector('.codigo-me');
        const codigoPausaInput = l.querySelector('.codigo-pausa');
        const dataEnvioInput = l.querySelector('.data-envio-maquina');
        const unOriginalInput = l.querySelector('.un-original') || l.querySelector('.unidades-original');
        servicos.push({
            codigoME: meInput ? meInput.value.toUpperCase().replace(/\s/g, '').trim() : '',
            nome:l.querySelector('.nome').value.toUpperCase().trim(),
            largura:l.querySelector('.larg').value,
            comprimento:l.querySelector('.comp').value,
            batidas:l.querySelector('.bat').value,
            unidades:l.querySelector('.un').value,
            unidadesOriginal: unOriginalInput ? unOriginalInput.value : l.querySelector('.un').value,
            horarioInicio:l.querySelector('.hi').value,
            dataEntrada:l.querySelector('.de').value,
            dataEnvioMaquina: dataEnvioInput ? dataEnvioInput.value : '',
            pausado:l.classList.contains('pausado'),
            pauseStart:l.dataset.pauseStart || null,
            codigoPausa: codigoPausaInput ? parseInt(codigoPausaInput.value) || null : null
        });
    });
    try {
        await fetch(API+'/api/maquinas-estado/'+num,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({bpm:parseInt(bpm),servicos})});
    } catch(e) { console.error(e); }
}

function recalcMaq(maq) {
    const bpm=parseFloat(maq.querySelector('.bpm-maq').value)||BPM;
    const ls=maq.querySelectorAll('.linha');
    let total=0;
    const agora=new Date();
    let proximoInicio = null;
    
    ls.forEach((l, index) => {
        const bat=parseFloat(l.querySelector('.bat').value)||0;
        const un=parseFloat(l.querySelector('.un').value)||0;
        const hiHidden=l.querySelector('.hi');
        const hiDataTxt=l.querySelector('.hi-data-txt');
        const hiHoraTxt=l.querySelector('.hi-hora-txt');
        const uf=l.querySelector('.faltam');
        const tb=bat*un,tm=tb/bpm,th=tm/60;
        
        // Se não é o primeiro serviço e temos um próximo início calculado, FORÇAR atualização
        if(index > 0 && proximoInicio) {
            // Formatar para ISO (hidden) - usar fuso local, não UTC
            const ano = proximoInicio.getFullYear();
            const mes = String(proximoInicio.getMonth() + 1).padStart(2, '0');
            const dia = String(proximoInicio.getDate()).padStart(2, '0');
            const hora = String(proximoInicio.getHours()).padStart(2, '0');
            const min = String(proximoInicio.getMinutes()).padStart(2, '0');
            const novoIni = ano + '-' + mes + '-' + dia + 'T' + hora + ':' + min;
            hiHidden.value = novoIni;
            // Atualizar campos texto visíveis separados
            if(hiDataTxt) hiDataTxt.value = dia + '/' + mes + '/' + ano;
            if(hiHoraTxt) hiHoraTxt.value = hora + ':' + min;
        }
        
        const hi = hiHidden.value;
        
        if(th>0){
            // Formatar tempo em horas e minutos
            const horas = Math.floor(th);
            const mins = Math.round((th - horas) * 60);
            l.querySelector('.tempo').value = horas > 0 ? horas + 'h' + (mins > 0 ? mins + 'm' : '') : mins + 'm';
            total+=tm;
            calcFim(l,hi,th);
            
            // Calcular próximo início para o PRÓXIMO serviço
            if(hi) {
                const di = new Date(hi);
                if(!isNaN(di.getTime())) {
                    const fimEste = calcHorarioConfig(di, th);
                    proximoInicio = new Date(fimEste.getTime() + 10 * 60 * 1000);
                } else {
                    proximoInicio = null;
                }
            } else {
                proximoInicio = null;
            }
            
            // Calcular faltam
            if(hi && un>0){
                const di=new Date(hi);
                if(!isNaN(di.getTime()) && agora>=di){
                    const dec=(agora-di)/(1000*60*60);
                    const tpu=th/un;
                    const prod=Math.min(un,Math.floor(dec/tpu));
                    const falta=Math.max(0,un-prod);
                    uf.value=falta;
                    uf.classList.toggle('zero',falta===0);
                } else {
                    uf.value=un;
                    uf.classList.remove('zero');
                }
            }
        } else {
            l.querySelector('.tempo').value='';
            l.querySelector('.hf').value='';
            uf.value='';
            proximoInicio=null;
        }
    });
    
    const tt=maq.querySelector('.tt');
    const totalHoras = total/60;
    const h = Math.floor(totalHoras);
    const m = Math.round((totalHoras - h) * 60);
    tt.textContent = h > 0 ? h + 'h' + (m > 0 ? m + 'm' : '') : m + 'm';
    tt.style.color=totalHoras<=2?'#e74c3c':totalHoras<=4?'#f39c12':'#27ae60';
    atualizarStatusLinhas();
    atualizarContadores();
    atualizarCronometroMaq(maq); // Atualiza cronômetro desta máquina
}

// Função para atualizar cronômetro de uma máquina específica
function atualizarCronometroMaq(maq) {
    const tr = maq.querySelector('.tr');
    if(!tr) return;
    
    const linhas = maq.querySelectorAll('.linha');
    if(linhas.length === 0) {
        tr.textContent = '--';
        tr.style.color = '#a0aec0';
        return;
    }
    
    // Verificar se algum serviço está pausado
    let temPausado = false;
    linhas.forEach(l => {
        if(l.classList.contains('pausado')) temPausado = true;
    });
    
    // Pegar o horário de INÍCIO do PRIMEIRO serviço
    const primeiraLinha = linhas[0];
    const hiDataTxt = primeiraLinha.querySelector('.hi-data-txt');
    const hiHoraTxt = primeiraLinha.querySelector('.hi-hora-txt');
    const hiHidden = primeiraLinha.querySelector('.hi');
    
    let hiVal = '';
    // Primeiro tenta do hidden
    if(hiHidden && hiHidden.value) {
        hiVal = hiHidden.value;
    }
    // Ou converte dos campos separados se disponível
    else if(hiDataTxt && hiHoraTxt && hiDataTxt.value && hiHoraTxt.value) {
        const dataStr = hiDataTxt.value.trim();
        const horaStr = hiHoraTxt.value.trim();
        const [dia, mes, ano] = dataStr.split('/');
        if(dia && mes && ano && horaStr) {
            hiVal = ano + '-' + mes.padStart(2,'0') + '-' + dia.padStart(2,'0') + 'T' + horaStr;
        }
    }
    
    if(!hiVal) {
        tr.textContent = '--';
        tr.style.color = '#a0aec0';
        return;
    }
    
    const inicioDate = new Date(hiVal);
    if(isNaN(inicioDate.getTime())) {
        tr.textContent = '--';
        tr.style.color = '#a0aec0';
        return;
    }
    
    // Calcular tempo total de todos os serviços (em minutos)
    const bpm = parseFloat(maq.querySelector('.bpm-maq').value) || 630;
    let totalMin = 0;
    linhas.forEach(l => {
        const bat = parseFloat(l.querySelector('.bat').value) || 0;
        const un = parseFloat(l.querySelector('.un').value) || 0;
        totalMin += (bat * un) / bpm;
    });
    
    // Adicionar 10 minutos entre cada serviço (exceto o primeiro)
    totalMin += (linhas.length - 1) * 10;
    
    const agora = new Date();
    
    // Se algum serviço está pausado, mostrar que está pausado
    if(temPausado) {
        // Encontrar serviço pausado e calcular tempo restante até aquele ponto
        let tempoAtePausa = 0;
        for(let i = 0; i < linhas.length; i++) {
            const l = linhas[i];
            if(l.classList.contains('pausado')) {
                // Calcular restante a partir deste ponto
                const restanteMin = totalMin - tempoAtePausa;
                const h = Math.floor(restanteMin / 60);
                const m = Math.round(restanteMin % 60);
                tr.textContent = '⏸ ' + (h > 0 ? h + 'h ' + m + 'm' : m + 'm');
                tr.style.color = '#f6ad55'; // Laranja para pausado
                return;
            }
            const bat = parseFloat(l.querySelector('.bat').value) || 0;
            const un = parseFloat(l.querySelector('.un').value) || 0;
            tempoAtePausa += (bat * un) / bpm;
            if(i < linhas.length - 1) tempoAtePausa += 10; // 10 min entre serviços
        }
    }
    
    // Se ainda não começou
    if(agora < inicioDate) {
        const h = Math.floor(totalMin / 60);
        const m = Math.round(totalMin % 60);
        tr.textContent = h > 0 ? h + 'h ' + m + 'm' : m + 'm';
        tr.style.color = '#a0aec0';
        return;
    }
    
    // Calcular quanto tempo passou desde o início
    const passadoMs = agora - inicioDate;
    const passadoMin = passadoMs / 1000 / 60;
    
    // Tempo restante
    const restanteMin = totalMin - passadoMin;
    
    if(restanteMin <= 0) {
        tr.textContent = '✅ Concluído';
        tr.style.color = '#48bb78';
        return;
    }
    
    // Converter para horas, minutos, segundos
    const restanteSeg = Math.floor(restanteMin * 60);
    const horas = Math.floor(restanteSeg / 3600);
    const minutos = Math.floor((restanteSeg % 3600) / 60);
    const segundos = restanteSeg % 60;
    
    // Formatar
    const formatNum = (n) => n.toString().padStart(2, '0');
    
    if(horas > 0) {
        tr.textContent = `${horas}h ${formatNum(minutos)}m ${formatNum(segundos)}s`;
    } else if(minutos > 0) {
        tr.textContent = `${minutos}m ${formatNum(segundos)}s`;
    } else {
        tr.textContent = `${segundos}s`;
    }
    
    // Cor baseada no tempo restante (em horas)
    const restanteHoras = restanteMin / 60;
    if(restanteHoras < 1) {
        tr.style.color = '#fc8181'; // Vermelho - menos de 1h
    } else if(restanteHoras < 4) {
        tr.style.color = '#f6e05e'; // Amarelo - menos de 4h
    } else {
        tr.style.color = '#68d391'; // Verde - mais de 4h
    }
}

// Função que atualiza todos os cronômetros e o campo Faltam (chamada a cada segundo)
function atualizarCronometros() {
    const agora = new Date();
    document.querySelectorAll('.maquina').forEach(maq => {
        atualizarCronometroMaq(maq);
        
        // Atualizar campo "Faltam" - só o serviço em ANDAMENTO deve diminuir
        const bpm = parseFloat(maq.querySelector('.bpm-maq').value) || 630;
        const linhas = maq.querySelectorAll('.linha');
        
        // Encontrar qual serviço está em andamento (amarelo)
        let servicoEmAndamento = null;
        let inicioAndamento = null;
        
        for(let i = 0; i < linhas.length; i++) {
            const l = linhas[i];
            if(l.classList.contains('andamento')) {
                servicoEmAndamento = l;
                // Pegar horário de início deste serviço
                const hiHidden = l.querySelector('.hi');
                const hiDataTxt = l.querySelector('.hi-data-txt');
                const hiHoraTxt = l.querySelector('.hi-hora-txt');
                
                let hi = '';
                if(hiHidden && hiHidden.value) {
                    hi = hiHidden.value;
                } else if(hiDataTxt && hiHoraTxt && hiDataTxt.value && hiHoraTxt.value) {
                    const dataStr = hiDataTxt.value.trim();
                    const horaStr = hiHoraTxt.value.trim();
                    const [dia, mes, ano] = dataStr.split('/');
                    if(dia && mes && ano && horaStr) {
                        hi = ano + '-' + mes.padStart(2,'0') + '-' + dia.padStart(2,'0') + 'T' + horaStr;
                    }
                }
                if(hi) inicioAndamento = new Date(hi);
                break;
            }
        }
        
        linhas.forEach(l => {
            const bat = parseFloat(l.querySelector('.bat').value) || 0;
            const un = parseFloat(l.querySelector('.un').value) || 0;
            const uf = l.querySelector('.faltam');
            
            if(!un || !bat) return;
            
            const tb = bat * un;
            const tm = tb / bpm;
            const th = tm / 60; // tempo em horas
            
            // Se é o serviço em andamento, calcular faltam
            if(l === servicoEmAndamento && inicioAndamento && !isNaN(inicioAndamento.getTime())) {
                if(agora >= inicioAndamento) {
                    const dec = (agora - inicioAndamento) / (1000 * 60 * 60); // horas decorridas
                    const tpu = th / un; // tempo por unidade
                    const prod = Math.min(un, Math.floor(dec / tpu));
                    const falta = Math.max(0, un - prod);
                    uf.value = falta;
                    uf.classList.toggle('zero', falta === 0);
                } else {
                    uf.value = un;
                    uf.classList.remove('zero');
                }
            }
            // Se é finalizado (verde), faltam = 0
            else if(l.classList.contains('finalizada')) {
                uf.value = 0;
                uf.classList.add('zero');
            }
            // Se é pendente (cinza), faltam = total
            else if(l.classList.contains('pendente')) {
                uf.value = un;
                uf.classList.remove('zero');
            }
        });
    });
}

function calcFim(l,hi,th) {
    const hf=l.querySelector('.hf');
    if(!hi||!th){hf.value='';return;}
    const di=new Date(hi);
    if(isNaN(di.getTime())){hf.value='Inv';return;}
    const df=calcHorarioConfig(di,th);
    hf.value=df.toLocaleDateString('pt-BR',{day:'2-digit',month:'2-digit'})+' '+df.toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'});
}

function calcHorarioConfig(di,dur) {
    let rest=dur,atual=new Date(di);
    const dias=['dom','seg','ter','qua','qui','sex','sab'];
    let loops=0;
    while(rest>0 && loops<1000){
        loops++;
        const ds=atual.getDay(),dc=dias[ds];
        const cb=document.getElementById(dc+'-at'),ativo=cb?cb.checked:true;
        if(!ativo){atual.setDate(atual.getDate()+1);atual.setHours(0,0,0,0);continue;}
        const ini=document.getElementById(dc+'-ini'),fim=document.getElementById(dc+'-fim'),pi=document.getElementById(dc+'-pi'),pf=document.getElementById(dc+'-pf');
        const [ih,im]=(ini?ini.value:'00:00').split(':').map(Number),[fh,fm]=(fim?fim.value:'23:59').split(':').map(Number);
        const [pih,pim]=(pi?pi.value:'00:00').split(':').map(Number),[pfh,pfm]=(pf?pf.value:'00:00').split(':').map(Number);
        const ha=atual.getHours()+atual.getMinutes()/60;
        const hini=ih+im/60;
        const hfim=fh+fm/60 + (fh===23&&fm===59?0.017:0); // 23:59 = quase 24h
        const hpi=pih+pim/60;
        const hpf=pfh+pfm/60;
        const temPausa = (hpi!==hpf); // só tem pausa se início != fim
        
        if(ha<hini){atual.setHours(ih,im,0,0);continue;}
        if(ha>=hfim){atual.setDate(atual.getDate()+1);atual.setHours(0,0,0,0);continue;}
        
        let disp=0;
        if(temPausa && ha<hpi){
            disp=hpi-ha;
            if(rest<=disp){atual.setTime(atual.getTime()+rest*3600000);rest=0;}
            else{rest-=disp;atual.setHours(pfh,pfm,0,0);}
        }
        else if(temPausa && ha>=hpi && ha<hpf){
            atual.setHours(pfh,pfm,0,0);
        }
        else{
            disp=hfim-ha;
            if(rest<=disp){atual.setTime(atual.getTime()+rest*3600000);rest=0;}
            else{rest-=disp;atual.setDate(atual.getDate()+1);atual.setHours(0,0,0,0);}
        }
    }
    return atual;
}

function atualizarStatusLinhas() {
    const agora = new Date();
    
    // Processar cada máquina separadamente
    document.querySelectorAll('.maquina').forEach(maq => {
        const linhas = maq.querySelectorAll('.linha');
        
        // Primeiro pass: identificar todos os status
        const statusList = [];
        
        linhas.forEach((l) => {
            // PRIORIZAR hidden, depois campos de texto separados
            const hiHidden = l.querySelector('.hi');
            const hiDataTxt = l.querySelector('.hi-data-txt');
            const hiHoraTxt = l.querySelector('.hi-hora-txt');
            
            let hi = '';
            // Primeiro tenta do hidden
            if(hiHidden && hiHidden.value) {
                hi = hiHidden.value;
            } 
            // Senão tenta converter dos campos separados
            else if(hiDataTxt && hiHoraTxt && hiDataTxt.value && hiHoraTxt.value) {
                const dataStr = hiDataTxt.value.trim();
                const horaStr = hiHoraTxt.value.trim();
                const [dia, mes, ano] = dataStr.split('/');
                if(dia && mes && ano && horaStr) {
                    hi = ano + '-' + mes.padStart(2,'0') + '-' + dia.padStart(2,'0') + 'T' + horaStr;
                }
            }
            
            const hfs = l.querySelector('.hf').value;
            const isPausado = l.classList.contains('pausado');
            
            if(isPausado) {
                statusList.push({ linha: l, status: 'pausado' });
                return;
            }
            
            if(!hi || !hfs || hfs.includes('Inv')) {
                statusList.push({ linha: l, status: 'pendente' });
                return;
            }
            
            const di = new Date(hi);
            if(isNaN(di.getTime())) {
                statusList.push({ linha: l, status: 'pendente' });
                return;
            }
            
            let df = null;
            if(hfs.includes('/')) {
                const [dp, hp] = hfs.split(' ');
                const [dia, mes] = dp.split('/');
                const [hora, min] = hp.split(':');
                let ano = agora.getFullYear();
                if(parseInt(mes) < agora.getMonth() + 1) ano++;
                df = new Date(ano, parseInt(mes)-1, parseInt(dia), parseInt(hora), parseInt(min));
            }
            
            // Determinar status baseado nos horários
            if(df && agora > df) {
                statusList.push({ linha: l, status: 'finalizada' });
            } else if(agora >= di) {
                statusList.push({ linha: l, status: 'em_andamento' });
            } else {
                statusList.push({ linha: l, status: 'pendente' });
            }
        });
        
        // Segundo pass: aplicar classes
        // Regra: só UM pode ser amarelo (o PRIMEIRO que está em_andamento após todos os finalizados)
        let jaMarcouAmarelo = false;
        
        statusList.forEach(item => {
            const l = item.linha;
            if(item.status === 'pausado') return;
            
            l.classList.remove('finalizada', 'andamento', 'pendente');
            
            if(item.status === 'finalizada') {
                l.classList.add('finalizada');
            } else if(item.status === 'em_andamento' && !jaMarcouAmarelo) {
                l.classList.add('andamento');
                jaMarcouAmarelo = true;
            } else {
                l.classList.add('pendente');
            }
        });
        
        // Atualizar código de parada da máquina
        atualizarCodigoPausaMaq(maq);
    });
    
    atualizarContadores();
}

// Cache para última etiqueta no index
let ultimaEtiquetaIndexCache = {};
let buscandoUltimaEtiqueta = {};

// Função para atualizar exibição do código de parada na máquina
function atualizarCodigoPausaMaq(maq) {
    const display = maq.querySelector('.codigo-parada-display');
    if(!display) return;
    
    const num = maq.dataset.n;
    const linhas = maq.querySelectorAll('.linha');
    let codigoPausa = null;
    
    // Verificar se algum serviço está pausado
    linhas.forEach(l => {
        if(l.classList.contains('pausado')) {
            // Buscar o código de pausa nos dados salvos
            const codigoEl = l.querySelector('.codigo-pausa');
            if(codigoEl && codigoEl.value) {
                codigoPausa = parseInt(codigoEl.value);
            }
        }
    });
    
    // Se não tem serviço, mostrar código 2 - Aguardando + última etiqueta
    if(linhas.length === 0) {
        display.style.display = 'inline';
        
        let html = '<span style="color:#4a5568">│</span> <span style="background:#3498db;color:#fff;padding:3px 8px;border-radius:5px;font-size:12px">🔵 Cód.2 - Aguardando Serviço</span>';
        
        // Mostrar última etiqueta do cache se existir
        const ultima = ultimaEtiquetaIndexCache[num];
        if(ultima && ultima.nome) {
            const meInfo = ultima.codigoME ? `${ultima.codigoME} - ` : '';
            html += ` <span style="background:#2c3e50;color:#fff;padding:3px 8px;border-radius:5px;font-size:11px;margin-left:5px;font-weight:bold">📋 Última: ${meInfo}${ultima.nome} (${ultima.largura}x${ultima.comprimento})</span>`;
        } else if(!buscandoUltimaEtiqueta[num]) {
            // Buscar última etiqueta apenas se não está buscando
            buscarUltimaEtiquetaIndex(num, maq);
        }
        
        display.innerHTML = html;
        return;
    }
    
    const codigosPausa = {
        1: {txt: 'Prep. Urdume', cor: '#f1c40f', emoji: '🟡'},
        3: {txt: 'Manutenção', cor: '#e67e22', emoji: '🟠'},
        4: {txt: 'Parada Técnica', cor: '#e74c3c', emoji: '🔴'},
        5: {txt: 'Ajuste Programa', cor: '#9b59b6', emoji: '🟣'},
        6: {txt: 'Amostra Qualidade', cor: '#1abc9c', emoji: '🟢'},
        7: {txt: 'Limit. Equipe', cor: '#34495e', emoji: '⚫'},
        8: {txt: 'Serv. Insuficiente | Maq. Desligada', cor: '#795548', emoji: '🟤'}
    };
    
    if(codigoPausa && codigosPausa[codigoPausa]) {
        const cp = codigosPausa[codigoPausa];
        display.style.display = 'inline';
        display.innerHTML = `<span style="color:#4a5568">│</span> <span style="background:${cp.cor};color:#fff;padding:3px 8px;border-radius:5px;font-size:12px">${cp.emoji} Cód.${codigoPausa} - ${cp.txt}</span>`;
    } else {
        display.style.display = 'none';
        display.innerHTML = '';
    }
}

// Buscar última etiqueta para o index (sem loop)
async function buscarUltimaEtiquetaIndex(num, maq) {
    if(buscandoUltimaEtiqueta[num]) return;
    buscandoUltimaEtiqueta[num] = true;
    
    try {
        const r = await fetch(API + '/api/ultima-finalizacao/' + num);
        const ultima = await r.json();
        if(ultima && ultima.nome) {
            ultimaEtiquetaIndexCache[num] = ultima;
            // Atualizar apenas o display desta máquina
            const display = maq.querySelector('.codigo-parada-display');
            if(display) {
                const meInfo = ultima.codigoME ? `${ultima.codigoME} - ` : '';
                display.innerHTML = '<span style="color:#4a5568">│</span> <span style="background:#3498db;color:#fff;padding:3px 8px;border-radius:5px;font-size:12px">🔵 Cód.2 - Aguardando Serviço</span>' +
                    ` <span style="background:#2c3e50;color:#fff;padding:3px 8px;border-radius:5px;font-size:11px;margin-left:5px;font-weight:bold">📋 Última: ${meInfo}${ultima.nome} (${ultima.largura}x${ultima.comprimento})</span>`;
            }
        }
    } catch(e) { /* ignora erro */ }
    
    buscandoUltimaEtiqueta[num] = false;
}

function atualizarContadores() {
    let f=0,a=0,p=0;
    document.querySelectorAll('.linha').forEach(l=>{if(l.classList.contains('finalizada'))f++;else if(l.classList.contains('andamento')||l.classList.contains('pausado'))a++;else p++;});
    document.getElementById('cFin').textContent=f;
    document.getElementById('cAnd').textContent=a;
    document.getElementById('cPen').textContent=p;
    document.getElementById('i-prod').textContent=f+a+p;
}

// FINALIZADOS
async function carregarFinalizados() {
    try {
        const r=await fetch(API+'/api/servicos-finalizados');
        finCache=await r.json();
        renderFin(finCache);
        document.getElementById('i-fin').textContent=finCache.length;
    } catch(e) { console.error(e); }
}

function renderFin(dados) {
    const c=document.getElementById('lista-fin');
    if(!dados.length){c.innerHTML='<div style="text-align:center;padding:40px;color:#94a3b8"><div style="font-size:48px;margin-bottom:15px">✅</div><p>Nenhum serviço finalizado</p></div>';return;}
    c.innerHTML=`<table class="tabela"><thead><tr><th>ME</th><th>Nome</th><th>Dim</th><th>Bat/Un</th><th>Tempo</th><th>Máq</th><th>Entrada</th><th>Finalizado</th><th>Ação</th></tr></thead><tbody>${dados.map(s=>{
        // Formatar tempo em horas e minutos
        const th = parseFloat(s.tempo) || 0;
        const h = Math.floor(th);
        const m = Math.round((th - h) * 60);
        const tempoFmt = h > 0 ? h + 'h' + (m > 0 ? m + 'm' : '') : m + 'm';
        // Formatar data de entrada sem problema de fuso horário
        let dataEnt = '-';
        if(s.data_entrada) {
            const partes = s.data_entrada.split('-');
            if(partes.length === 3) {
                dataEnt = partes[2] + '/' + partes[1] + '/' + partes[0];
            }
        }
        const meHtml = s.codigo_me ? `<span class="me-link" onclick="abrirHistoricoME('${s.codigo_me}')">${s.codigo_me}</span>` : '-';
        return `<tr><td>${meHtml}</td><td><strong>${s.nome}</strong></td><td>${s.largura}x${s.comprimento}</td><td>${s.batidas}/${s.unidades}</td><td>${tempoFmt}</td><td>M${s.maquina}</td><td>${dataEnt}</td><td>${new Date(s.data_finalizacao).toLocaleString('pt-BR')}</td><td><button class="btn-perigo btn-pequeno" onclick="delFin(${s.id})">🗑️</button></td></tr>`;
    }).join('')}</tbody></table>`;
}

function filtrarFin(){
    const busca = document.getElementById('busca-fin').value.toLowerCase().trim();
    let filtrados = finCache;
    
    if(busca) {
        const termos = busca.split(/\s+/).filter(t => t.length > 0);
        
        filtrados = filtrados.filter(s => {
            const campos = [
                s.codigo_me || '',
                s.nome || '',
                String(s.largura || ''),
                String(s.comprimento || ''),
                String(s.batidas || ''),
                String(s.unidades || ''),
                String(s.maquina || ''),
                `${s.largura}x${s.comprimento}`
            ].join(' ').toLowerCase();
            
            return termos.every(termo => campos.includes(termo));
        });
    }
    
    renderFin(filtrados);
}

async function delFin(id) {
    if(!confirm('Remover?')) return;
    try { await fetch(API+'/api/servicos-finalizados/'+id,{method:'DELETE'}); notif('Removido','success'); carregarFinalizados(); } catch(e) { notif('Erro','error'); }
}

// FERRAMENTAS
function exportar() {
    const bk={versao:'4.0',data:new Date().toISOString(),entrada:entCache,finalizados:finCache};
    const blob=new Blob([JSON.stringify(bk,null,2)],{type:'application/json'});
    const a=document.createElement('a');
    a.href=URL.createObjectURL(blob);
    a.download='TEAR_backup_'+new Date().toISOString().split('T')[0]+'.json';
    a.click();
    notif('Exportado!','success');
}

function importar() {
    notif('Use o servidor para importar dados','info');
}

function limpar() {
    if(!confirm('Limpar dados LOCAIS? (Servidor não será afetado)')) return;
    localStorage.clear();
    notif('Local limpo!','success');
}

// ========== FUNÇÕES NOVAS DA ENTRADA ==========

function buscarNome(termo) {
    const lista = document.getElementById('nome-autocomplete');
    if (!termo || termo.length < 1) {
        lista.classList.remove('ativo');
        return;
    }
    const filtrados = meCache.filter(me =>
        me.nome.toLowerCase().includes(termo.toLowerCase()) ||
        me.codigo_me.toLowerCase().includes(termo.toLowerCase())
    ).slice(0, 10);

    if (!filtrados.length) {
        lista.classList.remove('ativo');
        return;
    }

    lista.innerHTML = filtrados.map(me => `
        <div class="autocomplete-item" onclick="selecionarMENome('${me.codigo_me}')">
            <span class="me-codigo">${me.codigo_me}</span>
            <span class="me-nome">${me.nome} - ${me.largura}x${me.comprimento}</span>
        </div>
    `).join('');
    lista.classList.add('ativo');
}

function selecionarMENome(codigo) {
    const me = meCache.find(m => m.codigo_me === codigo);
    if (me) {
        document.getElementById('e-me').value = me.codigo_me;
        document.getElementById('e-nome').value = me.nome;
        document.getElementById('e-larg').value = me.largura;
        document.getElementById('e-comp').value = me.comprimento;
        document.getElementById('e-bat').value = me.batidas;
    }
    document.getElementById('nome-autocomplete').classList.remove('ativo');
}

function setTipo(tipo) {
    document.getElementById('e-tipo').value = tipo;
    document.querySelectorAll('.tipo-btn').forEach(btn => {
        btn.classList.remove('ativo');
    });
    const btnAtivo = document.querySelector('.tipo-btn.' + tipo.toLowerCase());
    if (btnAtivo) btnAtivo.classList.add('ativo');
}
