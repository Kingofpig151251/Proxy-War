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
    let { force, arms, food, skill } = message;

    // Convert to numbers and check for non-numeric values
    force = Number(force);
    arms = Number(arms);
    food = Number(food);
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
    this.skill = skill;
  }
}