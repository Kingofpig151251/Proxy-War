class Troop {
  constructor(funding = 0, force = 0, arms = 0, food = 0) {
    this._funding = funding;
    this._force = force;
    this._arms = arms;
    this._food = food;
    this._result = this._force + this._arms + this._food;
  }

  // #region Getters

  get funding() {
    return this._funding;
  }

  get force() {
    return this._force;
  }

  get arms() {
    return this._arms;
  }

  get food() {
    return this._food;
  }

  get result() {
    return this._result;
  }

  // #endregion

  // #region Setters

  set funding(resources) {
    //value can not bigger than this._funding
    var value = parseInt(resources.force) + parseInt(resources.arms) + parseInt(resources.food);
    console.log(value);
    if (value >= this._funding) {
      throw new Error("The total investment must less than funding.");
    }
    this._funding = value;
  }

  set force(value) {
    if (!Number.isInteger(value) || value < 0 || value >= this._funding) {
      throw new Error("Force must be a non-negative integer or less than funding.");
    }
    this._force = value;
  }

  set arms(value) {
    if (!Number.isInteger(value) || value < 0 || value >= this._funding) {
      throw new Error("Arms must be a non-negative integer or less than funding.");
    }
    this._arms = value;
  }

  set food(value) {
    if (!Number.isInteger(value) || value < 0 || value > this._funding) {
      throw new Error("Food must be a non-negative integer or less than funding.");
    }
    this._food = value;
  }

  // #endregion
}
module.exports = Troop;