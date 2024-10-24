/**
 * @extends {ItemSheet}
 */
export class InconvenientSheet extends ItemSheet {

  /** @inheritdoc */
  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      classes: ["knight", "sheet", "item", "inconvenient"],
      template: "systems/knight/templates/items/inconvenient-sheet.html",
      width: 700,
      height: 450,
      scrollY: [".attributes"],
    });
  }

  /* -------------------------------------------- */

  /** @inheritdoc */
  getData() {
    const context = super.getData();
    const type = this?.actor?.type || false;

    if(type !== false && type === 'ia') context.data.system.onlyIA = true;

    context.systemData = context.data.system;

    return context;
  }

  /* -------------------------------------------- */

  /** @inheritdoc */
	activateListeners(html) {
    super.activateListeners(html);

    // Everything below here is only needed if the sheet is editable
    if ( !this.isEditable ) return;

    html.find('div.initiative button').click(ev => {
      ev.preventDefault();
      const actuel = this.getData().data.system.malus.initiative.ifEmbuscade.has || false;

      let result = false;

      if(!actuel)  {
        result = true;
      }

      const update = {
        system: {
          malus: {
            initiative: {
              ifEmbuscade: {
                has:result
              }
            }
          }
        }
      };

      this.item.update(update);
    });

    html.find('div.augmentationCout button').click(ev => {
      ev.preventDefault();
      const actuel = this.getData().data.system.malus.coutsAugmentes.has || false;

      let result = false;

      if(!actuel)  {
        result = true;
      }

      const update = {
        system: {
          malus: {
            coutsAugmentes: {
                has:result
            }
          }
        }
      };

      this.item.update(update);
    });

    html.find('div.limitations button').click(ev => {
      ev.preventDefault();
      const type = $(ev.currentTarget).data("type");
      const actuel = this.getData().data.system.limitations.aspects[type].has || false;

      let result = false;

      if(!actuel)  {
        result = true;
      }

      const update = {
        system: {
          limitations: {
            aspects:{
              [type]: {
                has:result
              }
            }
          }
        }
      };

      this.item.update(update);
    });

    html.find('.inputAll').change(ev => {
      const val = +$(ev.currentTarget).val();
      const bete = +this.getData().data.system.limitations.aspects.bete.value;
      const chair = +this.getData().data.system.limitations.aspects.chair.value;
      const machine = +this.getData().data.system.limitations.aspects.machine.value;
      const dame = +this.getData().data.system.limitations.aspects.dame.value;
      const masque = +this.getData().data.system.limitations.aspects.masque.value;

      const update = {
        data: {
          limitations: {
            aspects:{
              bete: {
                max:val
              },
              chair: {
                max:val
              },
              machine: {
                max:val
              },
              dame: {
                max:val
              },
              masque: {
                max:val
              }
            }
          }
        }
      };

      if(val < bete) { update.data.limitations.aspects.bete.value = val; }
      if(val < chair) { update.data.limitations.aspects.chair.value = val; }
      if(val < machine) { update.data.limitations.aspects.machine.value = val; }
      if(val < dame) { update.data.limitations.aspects.dame.value = val; }
      if(val < masque) { update.data.limitations.aspects.masque.value = val; }

      this.item.update(update);
    });

    html.find('button.espoir').click(ev => {
      ev.preventDefault();
      const actuel = this.getData().data.system.limitations.espoir.aucunGain || false;

      let result = false;

      if(!actuel)  {
        result = true;
      }

      const update = {
        system: {
          limitations: {
            espoir: {
              aucunGain:result
            }
          }
        }
      };

      this.item.update(update);
    });
  }
}
