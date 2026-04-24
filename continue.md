Sige, gagawin ko in this order: (1) ayusin muna ang mobile editor capture para makumpleto, (2) tapos desktop, (3) update docs, (4) copy lahat ng docs sa exocore-docs para self-contained na, (5) gawan ng workflow ang docs preview.

Una, tingnan ko kung anong actual selectors ang ginagamit ng mobile editor para ma-fix ang sidebar/modal clicks na hindi gumana.


17 actions
Now I see the bugs in the mobile capture. The openMobileSidebar clicks selectors that don't exist (.mobile-hamburger etc.) — actual mobile drawer toggle is the .m-nav-btn with "Files" text. Let me fix the script properly.


7 actions
Now run mobile capture only with the fixes:


2 actions
Hit the 2 min timeout — let me run in background and poll progress:


3 actions
13 frames already captured. Let me wait for the python project step and check the theme-change duplicate:


2 actions
13 of 15 mobile frames captured (missing only pylib + theme-switch became a duplicate). Let me write a small targeted script to fill in those two:


3 actions
The fix-up script needs the panel unlock step first (fresh browser context = no panel session cookie). Let me add it:


3 actions
Mobile complete with 14 frames. Now let me check editor docs current state and the docs.ts loader:


6 actions
Now rewriting the editor README to walk through every captured frame, both desktop + mobile:


Edited exocore-web/docs/editor/README.md
