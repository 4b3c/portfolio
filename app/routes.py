from flask import Blueprint, render_template

main = Blueprint("main", __name__)

@main.route("/")
def home():
    return render_template("home.html")

@main.route("/grid")
def grid():
    return render_template("grid.html")

@main.route("/fall")
def fall():
    return render_template("fall.html")

@main.route("/liquid")
def liquid():
    return render_template("liquid.html")

@main.route("/cube-sand")
def cube_sand():
    return render_template("cube_sand.html")