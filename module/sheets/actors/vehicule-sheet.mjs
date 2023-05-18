import {
  getModStyle,
  listEffects,
  SortByName,
  compareArrays,
  sum,
  addOrUpdateEffect,
  addEffect,
  updateEffect,
  existEffect,
  confirmationDialog,
  getKnightRoll,
} from "../../helpers/common.mjs";

import { KnightRollDialog } from "../../dialog/roll-dialog.mjs";
import toggler from '../../helpers/toggler.js';

const path = {
  reaction:{
    bonus:'system.reaction.bonusValue',
    malus:'system.reaction.malusValue',
  },
  defense:{
    bonus:'system.defense.bonusValue',
    malus:'system.defense.malusValue',
  },
  armure:{
    bonus:'system.armure.bonusValue',
    malus:'system.armure.malusValue',
  },
  energie:{
    bonus:'system.energie.bonusValue',
    malus:'system.energie.malusValue',
  },
  champDeForce:{
    bonus:'system.champDeForce.bonusValue',
    malus:'system.champDeForce.malusValue',
  },
};

/**
 * @extends {ActorSheet}
 */
export class VehiculeSheet extends ActorSheet {

  /** @inheritdoc */
  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      classes: ["vehicule", "sheet", "actor"],
      template: "systems/knight/templates/actors/vehicule-sheet.html",
      width: 900,
      height: 600,
      tabs: [{navSelector: ".sheet-tabs", contentSelector: ".body", initial: "vehicule"}],
    });
  }

  /* -------------------------------------------- */

  /** @inheritdoc */
  getData() {
    const context = super.getData();

    this._prepareCharacterItems(context);
    this._prepareTranslation(context);

    context.systemData = context.data.system;
    context.systemData.wear = 'armure';

    return context;
  }

  /**
     * Return a light sheet if in "limited" state
     * @override
     */
   get template() {
    if (!game.user.isGM && this.actor.limited) {
      return "systems/knight/templates/actors/limited-sheet.html";
    }
    return this.options.template;
  }

  /* -------------------------------------------- */

  /** @inheritdoc */
  activateListeners(html) {
    super.activateListeners(html);

    toggler.init(this.id, html);

    html.find('img.dice').hover(ev => {
      $(ev.currentTarget).attr("src", "systems/knight/assets/icons/D6White.svg");
    }, ev => {
      $(ev.currentTarget).attr("src", "systems/knight/assets/icons/D6Black.svg");
    });

    html.find('img.option').click(ev => {
      const option = $(ev.currentTarget).data("option");
      const actuel = this.getData().data.system[option]?.optionDeploy || false;

      let result = false;
      if(actuel) {
        result = false;
      } else {
        result = true;
      }

      const update = {
        system: {
          [option]: {
            optionDeploy:result
          }
        }
      };

      this.actor.update(update);
    });

    // Everything below here is only needed if the sheet is editable
    if ( !this.isEditable ) return;

    html.find('.modules .activation').click(async ev => {
      const target = $(ev.currentTarget);
      const module = target.data("module");
      const name = target.data("name");
      const cout = eval(target.data("cout"));
      const value = target.data("value") ? false : true;

      const depense = await this._depensePE(name, cout);

      if(!depense) return;

      const dataModule = this.actor.items.get(module),
          data = dataModule.system,
          niveau = data.niveau.value,
          dataNiveau = data.niveau.details[`n${niveau}`];

      dataModule.update({[`system.active.base`]:value})

      if(dataNiveau.jetsimple.has && value) {
        const jSREffects = await getEffets(this.actor, 'contact', 'standard', {}, dataNiveau.jetsimple.effets, {raw:[], custom:[]}, {raw:[], custom:[]}, {raw:[], custom:[]}, false);
        const execJSR = new game.knight.RollKnight(dataNiveau.jetsimple.jet, this.actor.system);
        await execJSR.evaluate();

        let jSRoll = {
          flavor:dataNiveau.jetsimple.label,
          main:{
            total:execJSR._total,
            tooltip:await execJSR.getTooltip(),
            formula: execJSR._formula
          },
          other:jSREffects.other
        };

        const jSRMsgData = {
          user: game.user.id,
          speaker: {
            actor: this.actor?.id || null,
            token: this.actor?.token?.id || null,
            alias: this.actor?.name || null,
          },
          type: CONST.CHAT_MESSAGE_TYPES.OTHER,
          rolls:[execJSR].concat(jSREffects.rollDgts),
          content: await renderTemplate('systems/knight/templates/dices/wpn.html', jSRoll),
          sound: CONFIG.sounds.dice
        };

        const rMode = game.settings.get("core", "rollMode");
        const msgFData = ChatMessage.applyRollMode(jSRMsgData, rMode);

        await ChatMessage.create(msgFData, {
          rollMode:rMode
        });
      }
    });

    html.find('.item-create').click(this._onItemCreate.bind(this));

    html.find('.item-edit').click(ev => {
      const header = $(ev.currentTarget).parents(".summary");
      const item = this.actor.items.get(header.data("item-id"));

      item.sheet.render(true);
    });

    html.find('.item-delete').click(async ev => {
      const header = $(ev.currentTarget).parents(".summary");
      const item = this.actor.items.get(header.data("item-id"));

      if(!await confirmationDialog()) return;

      item.delete();
      header.slideUp(200, () => this.render(false));
    });

    html.find('div.combat div.armesDistance select.wpnMunitionChange').change(ev => {
      const target = $(ev.currentTarget);
      const id = target.data("id");
      const niveau = target.data("niveau");
      const value = target.val();
      const item = this.actor.items.get(id);

      if(item.type === 'module') {
        item.update({[`system.niveau.details.n${niveau}.arme.optionsmunitions.actuel`]:value});
      } else {
        item.update({['system.optionsmunitions.actuel']:value});
      }
    });

    html.find('.roll').click(ev => {
      const target = $(ev.currentTarget);
      const label = target.data("label") || '';
      const aspect = target.data("aspect") || '';
      const reussites = +target.data("reussitebonus") || 0;

      this._rollDice(label, aspect, false, false, '', '', '', -1, reussites);
    });

    html.find('.passager-delete').click(ev => {
      const target = $(ev.currentTarget).parents(".value");
      const id = target.data("id");
      const data = this.getData().data.system;
      const oldPassager = data.equipage.passagers;
      oldPassager.splice(id,1);

      this.actor.update({[`system.equipage.passagers`]:oldPassager});
    });

    html.find('.pilote-delete').click(ev => {
      const target = $(ev.currentTarget).parents(".value");
      const id = target.data("id");
      const data = this.getData().data.system;

      this.actor.update({[`system.equipage.pilote`]:{
        name:'',
        id:''
      }});

    });

    html.find('.passager-edit').click(ev => {
      const target = $(ev.currentTarget).parents(".value");
      const id = target.data("id");
      const data = this.getData().data.system;
      const oldPassager = data.equipage.passagers;
      const newPassager = oldPassager.splice(id,1);

      this.actor.update({[`system.equipage.passagers`]:oldPassager});
      this.actor.update({[`system.equipage.pilote`]:{
        id:newPassager[0].id,
        name:newPassager[0].name
      }});

    });

    html.find('.pilote-edit').click(ev => {
      const target = $(ev.currentTarget).parents(".value");
      const id = target.data("id");
      const data = this.getData().data.system;
      const oldPassager = data.equipage.passagers;
      oldPassager.push({
        name:data.equipage.pilote.name,
        id:data.equipage.pilote.id
      });

      this.actor.update({[`system.equipage.passagers`]:oldPassager});
      this.actor.update({[`system.equipage.pilote`]:{
        id:'',
        name:''
      }});

    });

    html.find('.jetPilotage').click(ev => {
      const data = this.getData();
      const actorId = data.data.system.equipage.pilote.id;
      const manoeuvrabilite = data.data.system.manoeuvrabilite;
      const label = `${game.i18n.localize("KNIGHT.VEHICULE.Pilotage")} : ${this.actor.name}`

      if(actorId === '') return;

      const actor = game.actors.get(actorId);

      if(actor.type === 'pnj') {
        this._rollDicePNJ(label, actorId, '', false, false, '' , '', '', -1, manoeuvrabilite);
      } else if(actor.type === 'knight') {
        this._rollDicePJ(label, actorId, '', false, false, '', '', '', -1, manoeuvrabilite)
      }
    });

    html.find('.jetWpn').click(ev => {
      const target = $(ev.currentTarget);
      const name = target.data("name");
      const id = target.data("id");
      const actorId = target.data("who");
      const isDistance = target.data("isdistance");
      const num = target.data("num");

      if(actorId === '') return;

      const actor = game.actors.get(actorId);

      if(actor.type === 'pnj') {
        this._rollDicePNJ(name, actorId, '', false, true, id, name, isDistance, num, 0);
      } else if(actor.type === 'knight') {
        this._rollDicePJ(name, actorId, '', false, true, id, name, isDistance, num, 0);
      }
    });

    html.find('.whoActivate').change(ev => {
      const target = $(ev.currentTarget);
      const id = target.data("id");
      const niveau = target.data("niveau");
      const value = target.val();
      const item = this.actor.items.get(id);

      if(item.type === 'module') {
        item.update({[`system.niveau.details.n${niveau}.whoActivate`]:value});
      } else {
        item.update({['system.whoActivate']:value});
      }
    });
  }

  /* -------------------------------------------- */
  async _onItemCreate(event) {
    event.preventDefault();
    const header = event.currentTarget;
    // Get the type of item to create.
    const type = header.dataset.type;
    // Grab any data associated with this control.
    const data = duplicate(header.dataset);
    // Initialize a default name.
    const name = `${game.i18n.localize(`ITEM.Type${type.capitalize()}`)}`;
    // Prepare the item object.
    const itemData = {
      name: name,
      type: type,
      system: data
    };

    switch(type) {
      case "arme":
          itemData.img = "systems/knight/assets/icons/arme.svg";
          break;

      case "armure":
          itemData.img = "systems/knight/assets/icons/armure.svg";
          break;

      case "avantage":
          itemData.img = "systems/knight/assets/icons/avantage.svg";
          break;

      case "inconvenient":
          itemData.img = "systems/knight/assets/icons/inconvenient.svg";
          break;

      case "motivationMineure":
          itemData.img = "systems/knight/assets/icons/motivationMineure.svg";
          break;

      case "langue":
          itemData.img = "systems/knight/assets/icons/langue.svg";
          break;

      case "contact":
          itemData.img = "systems/knight/assets/icons/contact.svg";
          break;

      case "blessure":
          itemData.img = "systems/knight/assets/icons/blessureGrave.svg";
          break;

      case "trauma":
          itemData.img = "systems/knight/assets/icons/trauma.svg";
          break;

      case "module":
          itemData.img = "systems/knight/assets/icons/module.svg";
          break;

      case "capacite":
          itemData.img = "systems/knight/assets/icons/capacite.svg";
          break;

      case "armurelegende":
          itemData.img = "systems/knight/assets/icons/armureLegende.svg";
          break;

      case "carteheroique":
          itemData.img = "systems/knight/assets/icons/carteheroique.svg";
          break;

      case "capaciteheroique":
          itemData.img = "systems/knight/assets/icons/capaciteheroique.svg";
          break;
    }

    // Remove the type from the dataset since it's in the itemData.type prop.
    delete itemData.system["type"];

    if (type === 'arme') {
      itemData.system = {
        type:header.dataset.subtype
      };
      delete itemData.system["subtype"];
    }

    const create = await Item.create(itemData, {parent: this.actor});

    // Finally, create the item!
    return create;
  }

  async _onDropActor(event, data) {
    if ( !this.actor.isOwner ) return false;

    const cls = getDocumentClass(data?.type);
    const document = await cls.fromDropData(data);
    const type = document.type;

    if(type === 'knight' || type === 'pnj') {

      const update = {
        system:{
          equipage:{
            passagers:this.getData().data.system.equipage.passagers
          }
        }
      };

      update.system.equipage.passagers.push({
        name:document.name,
        id:document.id
      });

      this.actor.update(update);
    }
  }

  async _onDropItemCreate(itemData) {
    itemData = itemData instanceof Array ? itemData : [itemData];
    const itemBaseType = itemData[0].type;
    const armeType = itemData[0].system.type;

    const typesValides = [
      'armure', 'capacite',
      'avantage', 'inconvenient',
      'motivationMineure', 'contact',
      'blessure', 'trauma',
      'armurelegende', 'effet', 'distinction',
      'capaciteultime'];
    if (typesValides.includes(itemBaseType)) return;
    if (itemBaseType === 'arme' && armeType === 'contact') return;

    const itemCreate = await this.actor.createEmbeddedDocuments("Item", itemData);

    return itemCreate;
  }

  async _prepareCharacterItems(sheetData) {
    const actorData = sheetData.actor;

    const armesDistance = [];
    const module = [];
    const moduleBonusDgts = {
      "contact":[],
      "distance":[]
    };
    const moduleBonusDgtsVariable = {
      "contact":[],
      "distance":[]
    };
    const moduleBonusViolence = {
      "contact":[],
      "distance":[]
    };
    const moduleBonusViolenceVariable = {
      "contact":[],
      "distance":[]
    };
    const effects = {armes:[], modules:[]};

    for (let i of sheetData.items) {
      const data = i.system;

      // ARME
      if (i.type === 'arme') {
        const raw = data.effets.raw;
        const custom = data.effets.custom;
        const labels = CONFIG.KNIGHT.effets;

        data.effets.liste = listEffects(raw, custom, labels);

        const effetsRaw = i.system.effets.raw;
        const bDefense = effetsRaw.find(str => { if(str.includes('defense')) return str; });
        const bReaction = effetsRaw.find(str => { if(str.includes('reaction')) return str; });

        if(bDefense !== undefined) {
          effects.armes.push({
            key: path.defense.bonus,
            mode: 2,
            priority: null,
            value: bDefense.split(' ')[1]
          });
        }
        if(bReaction !== undefined) {
          effects.armes.push({
            key: path.reaction.bonus,
            mode: 2,
            priority: null,
            value: bReaction.split(' ')[1]
          });
        }

        const rawDistance = data.distance.raw;
        const customDistance = data.distance.custom;
        const labelsDistance = CONFIG.KNIGHT.AMELIORATIONS.distance;
        const optionsMunitions = data?.optionsmunitions?.has || false;
        const munition = data?.options2mains?.actuel || "";
        const effetMunition = data?.optionsmunitions?.liste || {};

        data.distance.liste = listEffects(rawDistance, customDistance, labelsDistance);

        if(optionsMunitions === true) {
          data.degats.dice = data.optionsmunitions?.liste?.[munition]?.degats?.dice || 0;
          data.degats.fixe = data.optionsmunitions?.liste?.[munition]?.degats?.fixe || 0

          data.violence.dice = data.optionsmunitions?.liste?.[munition]?.violence?.dice || 0;
          data.violence.fixe = data.optionsmunitions?.liste?.[munition]?.violence?.fixe || 0;

          for (let [kM, munition] of Object.entries(effetMunition)) {
            const bRaw2 = munition.raw || [];
            const bCustom2 = munition.custom || [];

            munition.liste = listEffects(bRaw2, bCustom2, labels);
          }
        }

        armesDistance.push(i);
      }

      // MODULE
      if (i.type === 'module') {
        const niveau = data.niveau.value;
        const itemDataNiveau = data.niveau.details[`n${niveau}`];
        const itemBonus = itemDataNiveau.bonus;
        const itemArme = itemDataNiveau.arme;
        const itemOD = itemDataNiveau.overdrives;
        const itemActive = data?.active?.base || false;
        const itemErsatz = itemDataNiveau.ersatz;
        const itemWhoActivate = itemDataNiveau?.whoActivate || '';

        if(itemDataNiveau.permanent || itemActive) {
          if(itemBonus.has) {
            const iBArmure = itemBonus.armure;
            const iBCDF = itemBonus.champDeForce;
            const iBEnergie = itemBonus.energie;
            const iBDgts = itemBonus.degats;
            const iBDgtsVariable = iBDgts.variable;
            const iBViolence = itemBonus.violence;
            const iBViolenceVariable = iBViolence.variable;

            if(iBArmure.has) {
              effects.modules.push({
                key: path.armure.bonus,
                mode: 2,
                priority: null,
                value: iBArmure.value
              });
            }
            if(iBCDF.has) {
              effects.modules.push({
                key: path.champDeForce.bonus,
                mode: 2,
                priority: null,
                value: iBCDF.value
              });
            }
            if(iBEnergie.has) {
              effects.modules.push({
                key: path.energie.bonus,
                mode: 2,
                priority: null,
                value: iBEnergie.value
              });
            }
            if(iBDgts.has) {
              if(iBDgtsVariable.has) {
                moduleBonusDgtsVariable[iBDgts.type].push({
                  label:i.name,
                  description:i.system.description,
                  selected:{
                    dice:0,
                    fixe:0
                  },
                  min:{
                    dice:iBDgtsVariable.min.dice,
                    fixe:iBDgtsVariable.min.fixe
                  },
                  max:{
                    dice:iBDgtsVariable.max.dice,
                    fixe:iBDgtsVariable.max.fixe
                  }
                });
              } else {
                moduleBonusDgts[iBDgts.type].push({
                  label:i.name,
                  description:i.system.description,
                  dice:iBDgts.dice,
                  fixe:iBDgts.fixe
                });
              }
            }
            if(iBViolence.has) {
              if(iBViolenceVariable.has) {
                moduleBonusViolenceVariable[iBViolence.type].push({
                  label:i.name,
                  description:i.system.description,
                  selected:{
                    dice:0,
                    fixe:0
                  },
                  min:{
                    dice:iBViolenceVariable.min.dice,
                    fixe:iBViolenceVariable.min.fixe
                  },
                  max:{
                    dice:iBViolenceVariable.max.dice,
                    fixe:iBViolenceVariable.max.fixe
                  }
                });
              } else {
                moduleBonusViolence[iBViolence.type].push({
                  label:i.name,
                  description:i.system.description,
                  dice:iBViolence.dice,
                  fixe:iBViolence.fixe
                });
              }
            }
          }

          if(itemArme.has) {
            const moduleEffets = itemArme.effets;
            const moiduleEffetsRaw = moduleEffets.raw;
            const moduleEffetsCustom = moduleEffets.custom;
            const moduleEffetsFinal = {
              raw:[...new Set(moiduleEffetsRaw)],
              custom:moduleEffetsCustom,
              liste:moduleEffets.liste
            };
            const dataMunitions = itemArme?.optionsmunitions || {has:false};

            let degats = itemArme.degats;
            let violence = itemArme.violence;

            if(dataMunitions.has) {
              degats = dataMunitions.liste[dataMunitions.actuel]?.degats || {dice:0, fixe:0};
              violence = dataMunitions.liste[dataMunitions.actuel]?.violence || {dice:0, fixe:0};
            }

            const moduleWpn = {
              _id:i._id,
              name:i.name,
              type:'module',
              system:{
                noRack:true,
                type:itemArme.type,
                portee:itemArme.portee,
                degats:degats,
                violence:violence,
                optionsmunitions:dataMunitions,
                effets:{
                  raw:moduleEffets.raw,
                  custom:moduleEffets.custom
                },
                niveau:niveau,
                whoActivate:itemWhoActivate,
              }
            }

            const bDefense = moduleEffetsFinal.raw.find(str => { if(str.includes('defense')) return str; });
            const bReaction = moduleEffetsFinal.raw.find(str => { if(str.includes('reaction')) return str; });

            if(bDefense !== undefined) {
              effects.modules.push({
                key: path.defense.bonus,
                mode: 2,
                priority: null,
                value: bDefense.split(' ')[1]
              });
            }
            if(bReaction !== undefined) {
              effects.modules.push({
                key: path.reaction.bonus,
                mode: 2,
                priority: null,
                value: bReaction.split(' ')[1]
              });
            }

            if(itemArme.type === 'distance') {
              armesDistance.push(moduleWpn);
            }
          }
        }

        i.system.bonus = itemBonus;
        i.system.arme = itemArme;
        i.system.overdrives = itemOD;
        i.system.ersatz = itemErsatz;
        i.system.permanent = itemDataNiveau.permanent;
        i.system.duree = itemDataNiveau.duree;
        i.system.energie = itemDataNiveau.energie;
        i.system.rarete = itemDataNiveau.rarete;
        i.system.activation = itemDataNiveau.activation;
        i.system.portee = itemDataNiveau.portee;
        i.system.labels = itemDataNiveau.labels;
        i.system.pnj = itemDataNiveau.pnj;
        i.system.jetsimple = itemDataNiveau.jetsimple;
        i.system.effets = itemDataNiveau.effets;

        module.push(i);
      }
    }

    for(let i = 0;i < armesDistance.length;i++) {
      armesDistance[i].system.degats.module = {};
      armesDistance[i].system.degats.module.fixe = moduleBonusDgts.distance;
      armesDistance[i].system.degats.module.variable = moduleBonusDgtsVariable.distance;

      armesDistance[i].system.violence.module = {};
      armesDistance[i].system.violence.module.fixe = moduleBonusViolence.distance;
      armesDistance[i].system.violence.module.variable = moduleBonusViolenceVariable.distance;
    }

    actorData.armesDistance = armesDistance;
    actorData.modules = module;

    const listEffect = this.actor.getEmbeddedCollection('ActiveEffect');
    const listWithEffect = [
      {label:'Armes', data:effects.armes},
      {label:'Modules', data:effects.modules},
    ];

    const toUpdate = [];
    const toAdd = [];

    for(let effect of listWithEffect) {
      const effectExist = existEffect(listEffect, effect.label);
      let toggle = false;

      if(effectExist) {
        if(!compareArrays(effectExist.changes, effect.data)) toUpdate.push({
          "_id":effectExist._id,
          changes:effect.data,
          icon: '',
          disabled:toggle
        });
        else if(effectExist.disabled !== toggle) toUpdate.push({
          "_id":effectExist._id,
          icon: '',
          disabled:toggle
        });
      } else toAdd.push({
          label: effect.label,
          icon: '',
          changes:effect.data,
          disabled:toggle
      });
    }

    if(toUpdate.length > 0) updateEffect(this.actor, toUpdate);
    if(toAdd.length > 0) addEffect(this.actor, toAdd);

    // ON ACTUALISE ROLL UI S'IL EST OUVERT
    let rollUi = Object.values(ui.windows).find((app) => app instanceof KnightRollDialog) ?? false;

    if(rollUi !== false) {
      await rollUi.setVehicule(this.actor);
      await rollUi.setWpnDistance(armesDistance);

      rollUi.render(true);
    }
  }

  async _depensePE(label, depense, autosubstract=true) {
    const data = this.getData();
    const actuel = +data.systemData.energie.value;
    const substract = actuel-depense;

    if(substract < 0) {
      const lNot = game.i18n.localize('KNIGHT.JETS.Notenergie');

      const msgEnergie = {
        flavor:`${label}`,
        main:{
          total:`${lNot}`
        }
      };

      const msgEnergieData = {
        user: game.user.id,
        speaker: {
          actor: this.actor?.id || null,
          token: this.actor?.token?.id || null,
          alias: this.actor?.name || null,
        },
        type: CONST.CHAT_MESSAGE_TYPES.OTHER,
        content: await renderTemplate('systems/knight/templates/dices/wpn.html', msgEnergie),
        sound: CONFIG.sounds.dice
      };

      const rMode = game.settings.get("core", "rollMode");
      const msgData = ChatMessage.applyRollMode(msgEnergieData, rMode);

      await ChatMessage.create(msgData, {
        rollMode:rMode
      });

      return false;
    } else {

      if(autosubstract) {
        let update = {
          system:{
            energie:{
              value:substract
            }
          }
        }

        this.actor.update(update);
      }

      return true;
    }
  }

  async _rollDicePNJ(label, actorId, aspect = '', difficulte = false, isWpn = false, idWpn = '', nameWpn = '', typeWpn = '', num=-1, desBonus=0) {
    const data = this.getData();
    const queryInstance = getKnightRoll(this.actor, false);
    const rollApp = queryInstance.instance;
    const select = aspect;
    const deployWpnImproviseesDistance = false;
    const deployWpnImproviseesContact = false;
    const deployWpnDistance = false;
    const deployWpnTourelle = false;
    const deployWpnContact = false;
    const hasBarrage = false;
    const actor = game.actors.get(actorId);
    const armesDistance = isWpn ? this.actor.armesDistance : {};

    let armeDistanceFinal = armesDistance;

    for(let i = 0;i < Object.entries(armeDistanceFinal).length;i++) {
      const wpnData = armeDistanceFinal[i].system;
      const wpnMunitions = wpnData.optionsmunitions;
      const wpnMunitionActuel = wpnMunitions.actuel;
      const wpnMunitionsListe = wpnMunitions.liste[wpnMunitionActuel];

      if(wpnMunitions.has) {
        const eRaw = wpnData.effets.raw.concat(wpnMunitionsListe.raw);
        const eCustom = wpnData.effets.custom.concat(wpnMunitionsListe.custom);

        armeDistanceFinal[i].system.effets = {
          raw:[...new Set(eRaw)],
          custom:[...new Set(eCustom)],
        }
      }
    }

    await rollApp.setActor(actor, actor.isToken);
    await rollApp.setAspects(actor.system.aspects);
    await rollApp.setVehicule(this.actor);
    await rollApp.setEffets(hasBarrage, false, false, false);
    await rollApp.setData(label, select, [], [], difficulte,
      data.combat.data.modificateur, data.combat.data.succesbonus+desBonus,
      {dice:0, fixe:0},
      {dice:0, fixe:0},
      [], armeDistanceFinal, [], [], {contact:{}, distance:{}}, [], [],
      isWpn, idWpn, nameWpn, typeWpn, num,
      deployWpnContact, deployWpnDistance, deployWpnTourelle, deployWpnImproviseesContact, deployWpnImproviseesDistance, false, false, false,
      true, false);
    await rollApp.setBonusTemp(false, 0, 0);

    rollApp.render(true);
    if(queryInstance.previous) rollApp.bringToTop();
  }

  async _rollDicePJ(label, actorId, caracteristique, difficulte = false, isWpn = false, idWpn = '', nameWpn = '', typeWpn = '', num=-1, desBonus=0) {
    const actor = game.actors.get(actorId);
    const data = actor.system;
    const queryInstance = getKnightRoll(this.actor);
    const rollApp = queryInstance.instance;
    const style = data.combat.style;
    const getStyle = getModStyle(style);
    const deployWpnImproviseesDistance = typeWpn === 'armesimprovisees' && idWpn === 'distance' ? true : false;
    const deployWpnImproviseesContact = typeWpn === 'armesimprovisees' && idWpn === 'contact' ? true : false;
    const deployWpnDistance = typeWpn === 'distance' ? true : false;
    const deployWpnTourelle = typeWpn === 'tourelle' ? true : false;
    const deployWpnContact = typeWpn === 'contact' ? true : false;
    const deployGrenades = typeWpn === 'grenades' ? true : false;
    const deployLongbow = typeWpn === 'longbow' ? true : false;
    const hasBarrage = false;
    const armesDistance = isWpn ? this.actor.armesDistance : {};

    let armeDistanceFinal = armesDistance;

    for(let i = 0;i < Object.entries(armeDistanceFinal).length;i++) {
      const wpnData = armeDistanceFinal[i].system;
      const wpnMunitions = wpnData?.optionsmunitions || {has:false};
      const wpnMunitionActuel = wpnMunitions?.actuel || "";
      const wpnMunitionsListe = wpnMunitions?.liste?.[wpnMunitionActuel] || {};

      if(wpnMunitions.has) {
        const eRaw = wpnData.effets.raw.concat(wpnMunitionsListe.raw);
        const eCustom = wpnData.effets.custom.concat(wpnMunitionsListe.custom);

        armeDistanceFinal[i].system.effets = {
          raw:[...new Set(eRaw)],
          custom:[...new Set(eCustom)],
        }
      }
    }

    await rollApp.setData(label, caracteristique, [], [], difficulte,
      data.combat.data.modificateur, data.combat.data.succesbonus+desBonus,
      {dice:0, fixe:0},
      {dice:0, fixe:0},
      {}, armeDistanceFinal, {}, {}, {contact:{}, distance:{}}, [], [],
      isWpn, idWpn, nameWpn, typeWpn, num,
      deployWpnContact, deployWpnDistance, deployWpnTourelle, deployWpnImproviseesContact, deployWpnImproviseesDistance, deployGrenades, deployLongbow, false,
      false, false);
    await rollApp.setStyle({
      fulllabel:game.i18n.localize(`KNIGHT.COMBAT.STYLES.${style.toUpperCase()}.FullLabel`),
      label:game.i18n.localize(`KNIGHT.COMBAT.STYLES.${style.toUpperCase()}.Label`),
      raw:style,
      info:data.combat.styleInfo,
      caracteristiques:getStyle.caracteristiques,
      tourspasses:data.combat.data.tourspasses,
      type:data.combat.data.type,
      sacrifice:data.combat.data.sacrifice,
      maximum:6
    });
    await rollApp.setActor(actor, actor.isToken);
    await rollApp.setVehicule(this.actor);
    await rollApp.setAspects(data.aspects);
    await rollApp.setEffets(hasBarrage, true, true, true);
    await rollApp.setBonusTemp(false, 0, 0);

    rollApp.render(true);
    if(queryInstance.previous) rollApp.bringToTop();
  }

  /*_prepareModuleTranslation(context) {
    const modules = context.actor?.modules || false;

    if(modules === false) return;

    for (let [key, module] of Object.entries(modules)) {

      /*const raw = module.system.arme.effets.raw;
      const custom = module.system.arme.effets.custom;
      const labels = CONFIG.KNIGHT.effets;

      const rawD = module.system.arme.distance.raw;
      const customD = module.system.arme.distance.custom;
      const labelsD = CONFIG.KNIGHT.AMELIORATIONS.distance;

      const rawS = module.system.arme.structurelles.raw;
      const customS = module.system.arme.structurelles.custom;
      const labelsS = CONFIG.KNIGHT.AMELIORATIONS.structurelles;

      const rawO = module.system.arme.ornementales.raw;
      const customO = module.system.arme.ornementales.custom;
      const labelsO = CONFIG.KNIGHT.AMELIORATIONS.ornementales;

      const rawM = module.system.jetsimple.effets.raw;
      const customM = module.system.jetsimple.effets.custom;

      module.system.jetsimple.effets.liste = listEffects(rawM, customM, labels);
      module.system.arme.effets.liste = listEffects(raw, custom, labels);
      module.system.arme.distance.liste = listEffects(rawD, customD, labelsD);
      module.system.arme.structurelles.liste = listEffects(rawS, customS, labelsS);
      module.system.arme.ornementales.liste = listEffects(rawO, customO, labelsO);

      const pnj = module.system.pnj.liste;

      for (let [kNpc, npc] of Object.entries(pnj)) {
        if(npc.armes.has) {
          const armes = npc.armes.liste;

          for (let [kArme, arme] of Object.entries(armes)) {
            const rArme = arme.effets.raw;
            const cArme = arme.effets.custom;

            arme.effets.liste = listEffects(rArme, cArme, labels);
          }
        }
      }



      for(let n = 0;n < data.length;n++) {
        const optMun = data[n]?.system?.optionsmunitions?.has || false;

        if(base.key === 'armes' && optMun) {
          const dataMunitions = data[n].system.optionsmunitions;
          for(let m = 0;m <= dataMunitions.actuel;m++) {
            const mun = dataMunitions.liste[m];
            dataMunitions.liste[m].liste = listEffects(mun.raw, mun.custom, labels);
          }
        }
      }
    }
  }*/

  _prepareTranslation(actor, system) {
    const { modules,
      armesDistance } = actor;
    const labels = Object.assign({},
      CONFIG.KNIGHT.effets,
      CONFIG.KNIGHT.AMELIORATIONS.distance,
      CONFIG.KNIGHT.AMELIORATIONS.structurelles,
      CONFIG.KNIGHT.AMELIORATIONS.ornementales
    );
    const wpnModules = [
      {data:modules, key:'modules'},
      {data:armesDistance, key:'armes'},
    ];

    for(let i = 0;i < wpnModules.length;i++) {
      const base = wpnModules[i];
      const data = base.data;

      if(!data) continue;

      const listData = {
        modules:[{path:['system.effets', 'system.arme.effets', 'system.arme.distance', 'system.arme.structurelles', 'system.arme.ornementales', 'system.jetsimple.effets'], simple:true}],
        armes:[{path:['system.effets', 'system.effets2mains', 'system.distance', 'system.structurelles', 'system.ornementales'], simple:true}],
        grenades:[{path:['effets'], simple:true}]
      }[base.key];

      this._updateEffects(data, listData, labels, true);

      for(let n = 0;n < data.length;n++) {
        const optMun = data[n]?.system?.optionsmunitions?.has || false;

        if(base.key === 'armes' && optMun) {
          const dataMunitions = data[n].system.optionsmunitions;
          for(let m = 0;m <= dataMunitions.actuel;m++) {
            const mun = dataMunitions.liste[m];
            dataMunitions.liste[m].liste = listEffects(mun.raw, mun.custom, labels);
          }
        }
      }
    }
  }

  _updateEffects(listToVerify, list, labels, items = false) {
    const process = (capacite, path, simple) => {
      const data = path.split('.').reduce((obj, key) => obj?.[key], capacite);
      if (!data) return;
      const effets = simple ? data : data.effets;
      effets.liste = listEffects(effets.raw, effets.custom, labels);
    };

    if (!items) {
      for (const { name, path, simple } of list) {
        const capacite = listToVerify?.[name];
        if (!capacite) continue;
        path.forEach(p => process(capacite, p, simple));
      }
    } else {
      if (!listToVerify) return;
      for (const [key, module] of Object.entries(listToVerify)) {
        for (const { path, simple } of list) {
          path.forEach(p => process(module, p, simple));
        }
      }
    }
  }
}
