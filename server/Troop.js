class Troop {
  constructor(name, funding) {
    this.name = name;
    this.funding = funding;
    this.force = 0;
    this.arms = 0;
    this.food = 0;
    this.skill = '';
  }

  updateFromBattleMessage(message) {
    // Convert to numbers and check for non-numeric values
    let force = Number(message.force);
    let arms = Number(message.arms);
    let food = Number(message.food);
    if (isNaN(force) || isNaN(arms) || isNaN(food)) {
      throw new Error('Force, arms, and food must be numeric values.');
    }


    // Check if the total does not exceed the funding
    if (force + arms + food > this.funding) {
      throw new Error('The total of force, arms, and food cannot exceed the funding.');
    }

    // Update the properties
    this.force = force;
    this.arms = arms;
    this.food = food;
    this.funding -= force + arms + food;

    //if successful, consloe log the values
    console.log('Force:', this.force);
    console.log('Arms:', this.arms);
    console.log('Food:', this.food);
    console.log('Skill:', this.skill);
  }

  //遂項比較兩個軍隊的戰力
  compareForce(otherTroop) {
    if (this.force > otherTroop.force) {
      return 1;
    } else if (this.force < otherTroop.force) {
      return -1;
    } else {
      return 0;
    }
  }

  //遂項比較兩個軍隊的武器
  compareArms(otherTroop) {
    if (this.arms > otherTroop.arms) {
      return 1;
    } else if (this.arms < otherTroop.arms) {
      return -1;
    } else {
      return 0;
    }
  }

}
module.exports = Troop;