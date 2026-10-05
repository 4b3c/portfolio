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

@main.route("/learn")
def learn():
    return render_template("learn.html")

@main.route("/life")
def life():
    return render_template("life.html")

@main.route("/trees")
def trees():
    return render_template("trees.html")


@main.route("/projects")
def projects():
    return render_template("projects.html")
